// routes/admin.js
const { Router } = require('express');
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { DateTime } = require("luxon");
const { signToken, requireAuth } = require('../auth');

const r = Router();

function getHost(req) {
  const q = (req.query.host || '').toString().toLowerCase().replace(/^www\./,'');
  if (q) return q;
  const h = (req.get('x-owner-host') || '').toLowerCase().replace(/^www\./,'');
  if (h) return h;
  return (req.headers.host || '').toLowerCase().split(':')[0].replace(/^www\./,'');
}

async function getOwnerByHost(conn, host) {
  const [rows] = await conn.execute(
    `SELECT u.id, u.slug, u.name, u.email, u.timezone, u.password_hash
       FROM users u
       JOIN domains d ON d.user_id = u.id
      WHERE d.domain=? AND u.is_active=1
      LIMIT 1`, [host]
  );
  return rows[0] || null;
}

/** POST /admin/login  body: { email, password }  (scoped al host) */
r.post('/login', async (req, res) => {
  const host = getHost(req);
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(4)
  }).safeParse(req.body);
  console.log(host);
  console.log(body)
  if (!host) return res.status(400).json({ error: 'host_required' });
  if (!body.success) return res.status(400).json({ error: 'bad_request' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });

    // (Opcional) validar que el email coincide con el owner
    if (owner.email.toLowerCase() !== body.data.email.toLowerCase()) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (!owner.password_hash) {
      return res.status(401).json({ error: 'no_password_set' });
    }
    const ok = await bcrypt.compare(body.data.password, owner.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    const token = signToken(owner.id);
    res.json({ token, owner: { id: String(owner.id), slug: owner.slug, name: owner.name, email: owner.email } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

/** GET /admin/me  (verifica token + host scope) */
r.get('/me', requireAuth, async (req, res) => {
  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error: 'forbidden' });
    res.json({ id: String(owner.id), slug: owner.slug, name: owner.name, email: owner.email, timezone: owner.timezone });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

/** --- Event Types CRUD --- */

/** GET /admin/event-types */
r.get('/event-types', requireAuth, async (req, res) => {
  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    const [rows] = await conn.execute(
      `SELECT id, slug, name, description, duration_min, buffer_min, is_active
         FROM event_types WHERE user_id=? ORDER BY name ASC`, [owner.id]
    );
    res.json({ items: rows.map(r => ({ ...r, id: String(r.id) })) });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

/** POST /admin/event-types */
r.post('/event-types', requireAuth, async (req, res) => {
  const body = z.object({
    slug: z.string().min(2),
    name: z.string().min(2),
    description: z.string().optional().nullable(),
    durationMin: z.number().int().min(5).max(480),
    bufferMin: z.number().int().min(0).max(240).optional().default(0),
    isActive: z.boolean().optional().default(true),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error:'bad_request' });

  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    const [ins] = await conn.execute(
      `INSERT INTO event_types (user_id, slug, name, description, duration_min, buffer_min, is_active)
       VALUES (?,?,?,?,?,?,?)`,
      [owner.id, body.data.slug, body.data.name, body.data.description || null,
       body.data.durationMin, body.data.bufferMin || 0, body.data.isActive ? 1 : 0]
    );
    res.json({ ok:true, id: String(ins.insertId) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'internal_error' });
  } finally { conn.release(); }
});

/** PUT /admin/event-types/:id */
r.put('/event-types/:id', requireAuth, async (req, res) => {
  const id = +req.params.id;
  const body = z.object({
    name: z.string().min(2).optional(),
    description: z.string().optional().nullable(),
    durationMin: z.number().int().min(5).max(480).optional(),
    bufferMin: z.number().int().min(0).max(240).optional(),
    isActive: z.boolean().optional(),
  }).safeParse(req.body);
  if (!Number.isFinite(id) || !body.success) return res.status(400).json({ error:'bad_request' });

  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    // limitar por user_id
    const [up] = await conn.execute(
      `UPDATE event_types
          SET name=COALESCE(?, name),
              description=?,
              duration_min=COALESCE(?, duration_min),
              buffer_min=COALESCE(?, buffer_min),
              is_active=COALESCE(?, is_active)
        WHERE id=? AND user_id=?`,
      [body.data.name ?? null,
       body.data.description ?? null,
       body.data.durationMin ?? null,
       body.data.bufferMin ?? null,
       (body.data.isActive==null ? null : (body.data.isActive ? 1:0)),
       id, owner.id]
    );
    res.json({ ok:true, changed: up.affectedRows });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

/** DELETE /admin/event-types/:id */
r.delete('/event-types/:id', requireAuth, async (req, res) => {
  const id = +req.params.id;
  if (!Number.isFinite(id)) return res.status(400).json({ error:'bad_request' });
  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    const [del] = await conn.execute(`DELETE FROM event_types WHERE id=? AND user_id=?`, [id, owner.id]);
    res.json({ ok:true, deleted: del.affectedRows });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

/** --- Availability --- */

/** GET /admin/availability  -> lista todas las franjas del owner */
r.get('/availability', requireAuth, async (req, res) => {
  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    const [rows] = await conn.execute(
      `SELECT id, weekday, start_min, end_min
         FROM availability WHERE user_id=?
         ORDER BY weekday ASC, start_min ASC`, [owner.id]
    );
    res.json({ items: rows.map(r => ({ ...r, id: String(r.id) })) });
  } catch (e) { console.error(e); res.status(500).json({ error:'internal_error' }); }
  finally { conn.release(); }
});

/** PUT /admin/availability  -> reemplaza por día (bulk upsert simple)
 * body: { days: [{ weekday:0..6, ranges: [{start_min,end_min}, ...] }, ...] }
 */
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

  const host = getHost(req);
  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error:'owner_not_found' });
    if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error:'forbidden' });

    await conn.beginTransaction();

    for (const d of body.data.days) {
      await conn.execute(`DELETE FROM availability WHERE user_id=? AND weekday=?`, [owner.id, d.weekday]);
      for (const rge of d.ranges) {
        if (rge.end_min <= rge.start_min) continue; // ignora inválidos
        await conn.execute(
          `INSERT INTO availability (user_id, weekday, start_min, end_min) VALUES (?,?,?,?)`,
          [owner.id, d.weekday, rge.start_min, rge.end_min]
        );
      }
    }

    await conn.commit();
    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error:'internal_error' });
  } finally { conn.release(); }
});

r.get("/bookings", requireAuth, async (req, res) => {
    const host = getHost(req);
  
    // paginación segura
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const pageSizeRaw = Math.max(1, parseInt(req.query.pageSize || "50", 10));
    const pageSize = Math.min(200, pageSizeRaw);
    const offset = (page - 1) * pageSize;
  
    const qStatus = String(req.query.status || "");
    const qEventSlug = String(req.query.eventType || "");
    const qDate = String(req.query.date || ""); // YYYY-MM-DD
  
    const conn = await pool.getConnection();
    try {
      const owner = await getOwnerByHost(conn, host);
      if (!owner) return res.status(404).json({ error: "owner_not_found" });
      if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error: "forbidden" });
  
      // ventana por día (en TZ del owner) → a UTC, formato MySQL
      let startSQL = null, endSQL = null;
      if (qDate) {
        const start = DateTime.fromISO(qDate, { zone: owner.timezone }).startOf("day");
        const end   = start.endOf("day");
        startSQL = start.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
        endSQL   = end.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
      }
  
      const where = ["b.user_id = ?"];
      const args = [owner.id];
  
      if (qStatus === "confirmed" || qStatus === "cancelled") {
        where.push("b.status = ?");
        args.push(qStatus);
      }
      if (qEventSlug) {
        where.push("et.slug = ?");
        args.push(qEventSlug);
      }
      if (startSQL && endSQL) {
        // reservas que tocan ese día
        where.push("(b.starts_at < ? AND b.ends_at > ?)");
        args.push(endSQL, startSQL); // 1º end, 2º start
      }
  
      // ⚠️ Interpolamos los enteros para evitar placeholders en LIMIT
      const sql = `
        SELECT b.id, b.event_type_id, b.guest_name, b.guest_email,
               b.starts_at, b.ends_at, b.status,
               et.name AS event_type_name, et.slug AS event_type_slug, et.duration_min, et.buffer_min
          FROM bookings b
          JOIN event_types et ON et.id = b.event_type_id AND et.user_id = b.user_id
         WHERE ${where.join(" AND ")}
         ORDER BY b.starts_at DESC
         LIMIT ${Number(offset)|0}, ${Number(pageSize)|0}
      `;
  
      const [rows] = await conn.execute(sql, args);
  
      res.json({
        items: rows.map(r => ({
          id: String(r.id),
          eventType: { id: String(r.event_type_id), name: r.event_type_name, slug: r.event_type_slug },
          guestName: r.guest_name,
          guestEmail: r.guest_email,
          startsAt: r.starts_at,
          endsAt:   r.ends_at,
          status:   r.status,
          durationMin: r.duration_min,
          bufferMin: r.buffer_min,
        })),
        page, pageSize, timezone: owner.timezone
      });
    } catch (e) {
      console.error("bookings error", { msg: e.message });
      res.status(500).json({ error: "internal_error" });
    } finally {
      conn.release();
    }
  });
  
  /** PUT /admin/bookings/:id/status  body: { status: 'cancelled'|'confirmed' } */
  r.put("/bookings/:id/status", requireAuth, async (req, res) => {
    const id = +req.params.id;
    const body = z.object({ status: z.enum(["confirmed", "cancelled"]) }).safeParse(req.body);
    if (!Number.isFinite(id) || !body.success) return res.status(400).json({ error: "bad_request" });
  
    const host = getHost(req);
    const conn = await pool.getConnection();
    try {
      const owner = await getOwnerByHost(conn, host);
      if (!owner) return res.status(404).json({ error: "owner_not_found" });
      if (String(owner.id) !== req.auth.uid) return res.status(403).json({ error: "forbidden" });
  
      const [up] = await conn.execute(
        `UPDATE bookings SET status=? WHERE id=? AND user_id=?`,
        [body.data.status, id, owner.id]
      );
      res.json({ ok: true, changed: up.affectedRows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "internal_error" });
    } finally { conn.release(); }
  });

module.exports = r;