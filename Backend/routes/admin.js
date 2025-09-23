// routes/admin.js
const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { pool } = require('../db');
const { DateTime } = require("luxon");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const upload = multer({
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) return cb(new Error('bad_type'));
    cb(null, true);
  }
});
// Auth helpers (Access + Refresh)
const {
  requireAuth,
  signAccessToken,
  newJti,
  refreshCookieOptions,
  cookieName,
} = require('../auth');

const { oauthClient, SCOPES, insertEvent } = require('../lib/google');

const HEX = /^#[0-9a-fA-F]{6}$/;

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
    .slice(0,60) || 'tipo';
}

async function ensureUniqueSlug(conn, userId, baseSlug, excludeId = null) {
  let slug = baseSlug || 'tipo';
  let i = 1;
  while (true) {
    const [rows] = await conn.execute(
      `SELECT id FROM event_types WHERE user_id=? AND slug=? ${excludeId ? 'AND id<>?' : ''} LIMIT 1`,
      excludeId ? [userId, slug, excludeId] : [userId, slug]
    );
    if (rows.length === 0) return slug;
    i += 1;
    slug = `${baseSlug}-${i}`;
  }
}

const r = Router();

// ------- helpers por ID / email (admin NO usa ?u=) -------
async function getOwnerById(conn, id) {
  const [rows] = await conn.execute(
    `SELECT id, slug, name, email, timezone FROM users WHERE id=? AND is_active=1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}
async function getOwnerByEmail(conn, email) {
  const [rows] = await conn.execute(
    `SELECT id, slug, name, email, timezone, password_hash
       FROM users WHERE LOWER(email)=LOWER(?) AND is_active=1 LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

// ========================================================
// Auth
// ========================================================
r.post('/login', async (req, res) => {
  // Acepta con o sin `u` (u sirve para desambiguar si el mismo email existe en varios tenants)
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(4),
    u: z.string().optional()
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'bad_request' });

  const conn = await pool.getConnection();
  try {
    let owner = null;
    if (body.data.u) {
      // email + slug
      const [rows] = await conn.execute(
        `SELECT id, slug, name, email, timezone, password_hash
           FROM users WHERE slug=? AND LOWER(email)=LOWER(?) AND is_active=1 LIMIT 1`,
        [body.data.u.trim().toLowerCase(), body.data.email]
      );
      owner = rows[0] || null;
    } else {
      // solo email (requiere que el email sea único globalmente)
      owner = await getOwnerByEmail(conn, body.data.email);
    }
    if (!owner) return res.status(401).json({ error: 'invalid_credentials' });
    if (!owner.password_hash) return res.status(401).json({ error: 'no_password_set' });

    const ok = await bcrypt.compare(body.data.password, owner.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    // Access token corto
    const token = signAccessToken(String(owner.id));

    // Refresh token (jti) persistido y cookie HttpOnly
    const jti = newJti(); // uuid v4
    const expiresAt = DateTime.utc().plus({ days: 30 }).toSQL({ includeOffset: false });
    await conn.execute(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (?,?,?)`,
      [jti, owner.id, expiresAt]
    );
    res.cookie(cookieName, jti, refreshCookieOptions());

    res.json({
      token,
      owner: { id: String(owner.id), slug: owner.slug, name: owner.name, email: owner.email }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

// Refresh (rota el refresh y emite nuevo access)
r.post('/refresh', async (req, res) => {
  const jti = req.cookies?.[cookieName];
  if (!jti) return res.status(401).json({ error: 'unauthorized' });

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT user_id, is_revoked, expires_at FROM refresh_tokens WHERE jti=? LIMIT 1`,
      [jti]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'unauthorized' });
    if (row.is_revoked) return res.status(401).json({ error: 'unauthorized' });
    if (new Date(row.expires_at) < new Date()) return res.status(401).json({ error: 'unauthorized' });

    // Rotación: revoca el actual y crea uno nuevo
    await conn.beginTransaction();
    await conn.execute(`UPDATE refresh_tokens SET is_revoked=1 WHERE jti=?`, [jti]);

    const newId = crypto.randomUUID();
    const expiresAt = DateTime.utc().plus({ days: 30 }).toSQL({ includeOffset: false });
    await conn.execute(
      `INSERT INTO refresh_tokens (jti, user_id, expires_at) VALUES (?,?,?)`,
      [newId, row.user_id, expiresAt]
    );
    await conn.commit();

    // Nueva cookie y nuevo access
    res.cookie(cookieName, newId, refreshCookieOptions());
    const access = signAccessToken(String(row.user_id));
    res.json({ token: access });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  } finally {
    conn.release();
  }
});

// Logout (revoca refresh y limpia cookie)
r.post('/logout', async (req, res) => {
  const jti = req.cookies?.[cookieName];
  if (jti) {
    try {
      await pool.execute(`UPDATE refresh_tokens SET is_revoked=1 WHERE jti=?`, [jti]);
    } catch {}
  }
  res.clearCookie(cookieName, refreshCookieOptions());
  res.json({ ok: true });
});

// ========================================================
// Event Types / Availability / Bookings (protegidas)
// ========================================================
r.get('/me', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });
    res.json({ id: String(owner.id), slug: owner.slug, name: owner.name, email: owner.email, timezone: owner.timezone });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

r.get('/event-types', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    const [rows] = await conn.execute(
      `SELECT id, name, slug, duration_min, buffer_min, color_hex, is_active
         FROM event_types WHERE user_id=? ORDER BY name ASC`,
      [owner.id]
    );
    res.json({ items: rows.map(x => ({
      id: String(x.id),
      name: x.name,
      slug: x.slug,
      durationMin: x.duration_min,
      bufferMin: x.buffer_min,
      colorHex: x.color_hex,
      isActive: !!x.is_active
    }))});
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.post('/event-types', requireAuth, async (req, res) => {
  const body = z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    durationMin: z.number().int().min(5).max(24*60),
    bufferMin: z.number().int().min(0).max(8*60),
    colorHex: z.string().regex(HEX).default('#4f46e5'),
    isActive: z.boolean().default(true)
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    const base = slugify(body.data.slug || body.data.name);
    const unique = await ensureUniqueSlug(conn, owner.id, base, null);

    const [ins] = await conn.execute(
      `INSERT INTO event_types (user_id, name, slug, duration_min, buffer_min, color_hex, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [owner.id, body.data.name, unique, body.data.durationMin, body.data.bufferMin, body.data.colorHex, body.data.isActive ? 1 : 0]
    );

    res.json({ ok:true, id: String(ins.insertId) });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.put('/event-types/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error:'bad_request' });
  const body = z.object({
    name: z.string().min(1),
    slug: z.string().optional(),
    durationMin: z.number().int().min(5).max(24*60),
    bufferMin: z.number().int().min(0).max(8*60),
    colorHex: z.string().regex(HEX).default('#4f46e5'),
    isActive: z.boolean().default(true)
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    const [exists] = await conn.execute(
      `SELECT id FROM event_types WHERE id=? AND user_id=? LIMIT 1`, [id, owner.id]
    );
    if (!exists.length) return res.status(404).json({ error:'not_found' });

    const base = slugify(body.data.slug || body.data.name);
    const unique = await ensureUniqueSlug(conn, owner.id, base, id);

    await conn.execute(
      `UPDATE event_types
        SET name=?, slug=?, duration_min=?, buffer_min=?, color_hex=?, is_active=?
        WHERE id=? AND user_id=?`,
      [body.data.name, unique, body.data.durationMin, body.data.bufferMin, body.data.colorHex, body.data.isActive ? 1 : 0, id, owner.id]
    );
    res.json({ ok:true });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.delete('/event-types/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error:'bad_request' });
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    await conn.execute(`DELETE FROM event_types WHERE id=? AND user_id=?`, [id, owner.id]);
    res.json({ ok:true });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

// ------- Availability -------
r.get('/availability', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    const [rows] = await conn.execute(
      `SELECT id, weekday, start_min, end_min
         FROM availability WHERE user_id=? ORDER BY weekday ASC, start_min ASC`,
      [owner.id]
    );
    res.json({ items: rows.map(v => ({ ...v, id: String(v.id) })) });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.put('/availability', requireAuth, async (req, res) => {
  const body = z.object({
    days: z.array(z.object({
      weekday: z.number().int().min(0).max(6),
      ranges: z.array(z.object({
        start_min: z.number().int().min(0).max(1440),
        end_min: z.number().int().min(0).max(1440)
      })).default([])
    })).default([])
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    await conn.beginTransaction();
    for (const d of body.data.days) {
      await conn.execute(`DELETE FROM availability WHERE user_id=? AND weekday=?`, [owner.id, d.weekday]);
      for (const rge of d.ranges) {
        if (rge.end_min <= rge.start_min) continue;
        await conn.execute(
          `INSERT INTO availability (user_id, weekday, start_min, end_min) VALUES (?,?,?,?)`,
          [owner.id, d.weekday, rge.start_min, rge.end_min]
        );
      }
    }
    await conn.commit();
    res.json({ ok:true });
  } catch (e) { console.error(e); try{await conn.rollback();}catch{} res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

// ------- Bookings -------
r.get("/bookings", requireAuth, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page || "1", 10));
  const pageSizeRaw = Math.max(1, parseInt(req.query.pageSize || "50", 10));
  const pageSize = Math.min(200, pageSizeRaw);
  const offset = (page - 1) * pageSize;

  const qStatus = String(req.query.status || "");
  const qEventSlug = String(req.query.eventType || "");
  const qDate = String(req.query.date || ""); // YYYY-MM-DD

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error: "owner_not_found" });

    let startSQL = null, endSQL = null;
    if (qDate) {
      const start = DateTime.fromISO(qDate, { zone: owner.timezone }).startOf("day");
      const end   = start.endOf("day");
      startSQL = start.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
      endSQL   = end.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
    }

    const where = ["b.user_id = ?"];
    const args = [owner.id];

    if (qStatus === "confirmed" || qStatus === "cancelled") { where.push("b.status = ?"); args.push(qStatus); }
    if (qEventSlug) { where.push("et.slug = ?"); args.push(qEventSlug); }
    if (startSQL && endSQL) { where.push("(b.starts_at < ? AND b.ends_at > ?)"); args.push(endSQL, startSQL); }

    const sql = `
      SELECT b.id, b.event_type_id, b.guest_name, b.guest_email,
             b.starts_at, b.ends_at, b.status,
             et.name AS event_type_name, et.slug AS event_type_slug,
             et.duration_min, et.buffer_min, et.color_hex AS event_type_color
        FROM bookings b
        JOIN event_types et ON et.id = b.event_type_id AND et.user_id = b.user_id
       WHERE ${where.join(" AND ")}
       ORDER BY b.starts_at DESC
       LIMIT ${Number(offset)|0}, ${Number(pageSize)|0}`;

    const [rows] = await conn.execute(sql, args);

    res.json({
      items: rows.map(rw => ({
        id: String(rw.id),
        eventType: { id: String(rw.event_type_id), name: rw.event_type_name, slug: rw.event_type_slug, colorHex: rw.event_type_color },
        guestName: rw.guest_name,
        guestEmail: rw.guest_email,
        startsAt: rw.starts_at,
        endsAt:   rw.ends_at,
        status:   rw.status,
        durationMin: rw.duration_min,
        bufferMin: rw.buffer_min,
      })),
      page, pageSize, timezone: owner.timezone
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "internal_error" }); }
  finally { conn.release(); }
});

r.post("/bookings", requireAuth, async (req, res) => {
  const body = z.object({
    eventType:  z.string().min(1), // slug
    guestName:  z.string().min(1),
    guestEmail: z.string().email(),
    startISO:   z.string(),        // UTC ISO
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "bad_request" });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) { await conn.rollback(); return res.status(404).json({ error: "owner_not_found" }); }

    const et = (await conn.execute(
      `SELECT id, name, duration_min, buffer_min
         FROM event_types
        WHERE user_id=? AND slug=? AND is_active=1
        LIMIT 1`, [owner.id, body.data.eventType]
    ))[0][0];
    if (!et) { await conn.rollback(); return res.status(404).json({ error: "event_type_not_found" }); }

    const startUTC = DateTime.fromISO(body.data.startISO, { zone: "utc" });
    if (!startUTC.isValid) { await conn.rollback(); return res.status(400).json({ error: "invalid_start" }); }
    const endUTC = startUTC.plus({ minutes: et.duration_min });

    const clash = (await conn.execute(
      `SELECT id FROM bookings
        WHERE user_id=? AND status='confirmed'
          AND starts_at < ? AND ends_at > ?
        FOR UPDATE`,
      [owner.id,
        endUTC.toSQL({ includeOffset: false }),
        startUTC.toSQL({ includeOffset: false })]
    ))[0];
    if (clash.length) { await conn.rollback(); return res.status(409).json({ error: "slot_taken" }); }

    const [ins] = await conn.execute(
      `INSERT INTO bookings (user_id, event_type_id, guest_name, guest_email, starts_at, ends_at, status)
        VALUES (?,?,?,?,?,?, 'confirmed')`,
      [owner.id, et.id, body.data.guestName, body.data.guestEmail,
        startUTC.toSQL({ includeOffset: false }),
        endUTC.toSQL({ includeOffset: false })]
    );
    const bookingId = ins.insertId;

    await conn.commit();

    try {
      const sync = await insertEvent({
        user: { id: owner.id, timezone: owner.timezone },
        booking: {
          id: bookingId,
          starts_at: startUTC.toISO(),
          ends_at: endUTC.toISO(),
          guest_name: body.data.guestName,
          guest_email: body.data.guestEmail
        },
        eventType: { name: et.name }
      });
      if (sync?.ok) {
        await pool.execute(
          `UPDATE bookings SET google_event_id=?, google_calendar_id=? WHERE id=?`,
          [sync.eventId, sync.calendarId, bookingId]
        );
      }
    } catch (e) { console.warn("google sync error:", e); }

    res.json({ ok: true, id: String(bookingId) });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

r.put("/bookings/:id/status", requireAuth, async (req, res) => {
  const id = +req.params.id;
  const body = z.object({ status: z.enum(["confirmed", "cancelled"]) }).safeParse(req.body);
  if (!Number.isFinite(id) || !body.success) return res.status(400).json({ error: "bad_request" });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error: "owner_not_found" });

    const [up] = await conn.execute(
      `UPDATE bookings SET status=? WHERE id=? AND user_id=?`,
      [body.data.status, id, owner.id]
    );
    res.json({ ok: true, changed: up.affectedRows });
  } catch (e) { console.error(e); res.status(500).json({ error: "internal_error" }); }
  finally { conn.release(); }
});

// ------- Google (usa token/uid) -------
r.get('/google/auth-url', requireAuth, async (_req,res)=>{
  const client = oauthClient();
  const url = client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: String(_req.auth.uid)
  });
  res.json({ url });
});

r.get('/google/status', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    const [[tok]] = await conn.query(`SELECT refresh_token IS NOT NULL AS has_refresh FROM google_tokens WHERE user_id=?`, [owner.id]);
    const [[cs]]  = await conn.query(`SELECT calendar_id, sync_enabled FROM calendar_settings WHERE user_id=?`, [owner.id]);

    res.json({
      connected: !!(tok && tok.has_refresh),
      calendarId: cs?.calendar_id || 'primary',
      syncEnabled: cs ? !!cs.sync_enabled : true
    });
  } finally { conn.release(); }
});

r.get('/google/calendars', requireAuth, async (_req, res) => {
  res.status(501).json({ error: 'not_implemented' });
});

r.post('/google/settings', requireAuth, async (req, res) => {
  const body = z.object({
    calendarId: z.string().min(1),
    syncEnabled: z.boolean().optional()
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    await conn.execute(
      `INSERT INTO calendar_settings (user_id, provider, calendar_id, sync_enabled)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE calendar_id=VALUES(calendar_id), sync_enabled=VALUES(sync_enabled)`,
      [owner.id, 'google', body.data.calendarId, body.data.syncEnabled ?? 1]
    );
    res.json({ ok:true });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.delete('/google/disconnect', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    await conn.execute(`DELETE FROM google_tokens WHERE user_id=?`, [owner.id]);
    res.json({ ok:true });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

r.get('/profile', requireAuth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    const [rows] = await conn.execute(`SELECT email FROM users WHERE id=? LIMIT 1`, [owner.id]);
    if (!rows.length) return res.status(404).json({ error:'not_found' });
    res.json({ email: rows[0].email });
  } finally { conn.release(); }
});

r.put('/profile/email', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error:'bad_request' });
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    await conn.execute(`UPDATE users SET email=? WHERE id=?`, [email, owner.id]);
    res.json({ ok:true });
  } finally { conn.release(); }
});

r.put('/profile/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error:'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerById(conn, req.auth.uid);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });

    const [rows] = await conn.execute(`SELECT password_hash FROM users WHERE id=?`, [owner.id]);
    if (!rows.length) return res.status(404).json({ error:'not_found' });

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash || "");
    if (!ok) return res.status(400).json({ error:'wrong_password' });

    const hash = await bcrypt.hash(newPassword, 10);
    await conn.execute(`UPDATE users SET password_hash=? WHERE id=?`, [hash, owner.id]);

    res.json({ ok:true });
  } finally { conn.release(); }
});

r.post('/profile/avatar', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no_file' });

  const ext = path.extname(req.file.originalname || '.jpg').toLowerCase() || '.jpg';
  const dir = path.join(__dirname, '..', 'public', 'avatars'); // asegúrate de servir /public
  fs.mkdirSync(dir, { recursive: true });

  const filename = `u${req.auth.uid}-${Date.now()}${ext}`;
  const full = path.join(dir, filename);
  fs.writeFileSync(full, req.file.buffer);

  const avatarUrl = `/avatars/${filename}`;
  // persiste en DB
  await pool.execute(`UPDATE users SET avatar_url=? WHERE id=?`, [avatarUrl, req.auth.uid]);

  res.json({ avatarUrl });
});

r.get('/profile', requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT email, name, avatar_url AS avatarUrl FROM users WHERE id=? LIMIT 1`,
    [req.auth.uid]
  );
  if (!rows.length) return res.status(404).json({ error: 'not_found' });
  res.json(rows[0]);
});

module.exports = r;
