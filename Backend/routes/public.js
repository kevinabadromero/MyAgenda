const { Router } = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { DateTime, dayBoundsUTC } = require('../time');

const r = Router();

// Detecta host: ?host=... > X-Owner-Host > Host
function getHost(req) {
  const q = (req.query.host || '').toString().toLowerCase().replace(/^www\./,'');
  if (q) return q;
  const h = (req.get('x-owner-host') || '').toLowerCase().replace(/^www\./,'');
  if (h) return h;
  return (req.headers.host || '').toLowerCase().split(':')[0].replace(/^www\./,'');
}

async function getOwnerByHost(conn, host) {
  const [rows] = await conn.execute(
    `SELECT u.id, u.slug, u.name, u.email, u.timezone,
            b.favicon, b.logo, b.primary_hex, b.bg_hex, b.fg_hex
       FROM users u
       JOIN domains d ON d.user_id = u.id
  LEFT JOIN branding b ON b.user_id = u.id
      WHERE d.domain = ? AND u.is_active = 1
      LIMIT 1`,
    [host]
  );
  return rows[0] || null;
}

/** GET /public/profile?host=... */
r.get('/profile', async (req, res) => {
  const host = getHost(req);
  if (!host) return res.status(400).json({ error: 'host_required' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });

    res.json({
      id: String(owner.id),
      slug: owner.slug,
      name: owner.name,
      favicon: owner.favicon || '/favicon.ico',
      logo: owner.logo || null,
      timezone: owner.timezone,   
      theme: {
        primary: owner.primary_hex || '#2563EB',
        bg: owner.bg_hex || '#FFFFFF',
        fg: owner.fg_hex || '#111111'
      }
    });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

/** GET /public/event-types?host=... */
r.get('/event-types', async (req, res) => {
  const host = getHost(req);
  if (!host) return res.status(400).json({ error: 'host_required' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });

    const [items] = await conn.execute(
      `SELECT id, slug, name, description, duration_min
         FROM event_types
        WHERE user_id=? AND is_active=1
        ORDER BY name ASC`,
      [owner.id]
    );

    res.json({
      items: items.map(i => ({
        id: String(i.id),
        slug: i.slug,
        name: i.name,
        description: i.description,
        durationMin: i.duration_min
      }))
    });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

/** GET /public/slots?host=...&eventType=...&date=YYYY-MM-DD */
r.get("/slots", async (req, res) => {
    const host = getHost(req);
  
    const parsed = z.object({
      eventType: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    }).safeParse({ eventType: req.query.eventType, date: req.query.date });
  
    if (!host) return res.status(400).json({ error: "host_required" });
    if (!parsed.success) return res.status(400).json({ error: "bad_request" });
  
    const { eventType, date } = parsed.data;
  
    const conn = await pool.getConnection();
    try {
      const owner = await getOwnerByHost(conn, host);
      if (!owner) return res.status(404).json({ error: "owner_not_found" });
  
      // tipo de evento
      const [etRows] = await conn.execute(
        `SELECT id, duration_min, buffer_min
           FROM event_types
          WHERE user_id=? AND slug=? AND is_active=1
          LIMIT 1`,
        [owner.id, eventType]
      );
      const et = etRows[0];
      if (!et) return res.status(404).json({ error: "event_type_not_found" });
  
      const durationMin = Number(et.duration_min);
      const bufferMin   = Number(et.buffer_min || 0);
  
      // ventana del día en TZ del owner → UTC (formato MySQL)
      const dayStart = DateTime.fromISO(date, { zone: owner.timezone }).startOf("day");
      const dayEnd   = dayStart.endOf("day");
      const startSQL = dayStart.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
      const endSQL   = dayEnd.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
  
      // weekday (0=Dom .. 6=Sáb) → Luxon: 1=Lun .. 7=Dom
      const weekday = dayStart.weekday % 7; // 7%7=0 → Domingo
  
      // disponibilidad del día
      const [availRows] = await conn.execute(
        `SELECT start_min, end_min
           FROM availability
          WHERE user_id=? AND weekday=?
          ORDER BY start_min ASC`,
        [owner.id, weekday]
      );
      if (availRows.length === 0) return res.json({ slots: [] });
  
      // reservas del día (cualquier tipo), con buffer del tipo reservado
      const [bkRows] = await conn.execute(
        `SELECT b.starts_at, b.ends_at, et.buffer_min AS booking_buffer_min
           FROM bookings b
           JOIN event_types et ON et.id = b.event_type_id
          WHERE b.user_id=? AND b.status <> 'cancelled'
            AND b.starts_at < ? AND b.ends_at > ?`,
        [owner.id, endSQL, startSQL]
      );
  
      // normalizar a ms UTC
      const dayStartMs = dayStart.toUTC().toMillis();
      const bookings = bkRows.map(row => ({
        startMs: new Date(row.starts_at).getTime(),
        endMs:   new Date(row.ends_at).getTime(),
        bufferAfterMs: Number(row.booking_buffer_min || 0) * 60000
      }));
  
      const durationMs = durationMin * 60000;
      const bufferAfterMs = bufferMin * 60000;
      const stepMs = durationMs; // slots cada "duración"
  
      const slots = [];
  
      for (const a of availRows) {
        const rangeStartMs = dayStartMs + Number(a.start_min) * 60000;
        const rangeEndMs   = dayStartMs + Number(a.end_min)   * 60000;
  
        // candidato s: debe caber con SU buffer dentro de la franja
        for (let s = rangeStartMs; s + durationMs + bufferAfterMs <= rangeEndMs + 1; s += stepMs) {
          const sEndPadded = s + durationMs + bufferAfterMs;
  
          // conflictivo si se solapa con alguna reserva considerando el buffer de esa reserva
          let ok = true;
          for (const b of bookings) {
            const bEndPadded = b.endMs + b.bufferAfterMs;
            // solape si [s, sEndPadded) ∩ [b.startMs, bEndPadded) ≠ ∅
            if (s < bEndPadded && sEndPadded > b.startMs) { ok = false; break; }
          }
          if (!ok) continue;
  
          const iso = new Date(s).toISOString(); // UTC, lo usa el front tal cual
          const label = new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  
          slots.push({ iso, label });
        }
      }
  
      // ordena y responde
      slots.sort((a,b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
      res.json({ slots });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: "internal_error" });
    } finally {
      conn.release();
    }
  });

/** POST /public/book?host=...
 * body: { eventType, guestName, guestEmail, startISO(UTC) }
 */
r.post('/book', async (req, res) => {
  const body = z.object({
    eventType: z.string(),
    guestName: z.string().min(1),
    guestEmail: z.string().email(),
    startISO: z.string() // en UTC
  }).safeParse(req.body);

  const host = getHost(req);
  if (!host) return res.status(400).json({ error: 'host_required' });
  if (!body.success) return res.status(400).json({ error: 'bad_request' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const ownerQ = await conn.execute(
      `SELECT u.id, u.timezone
         FROM users u
         JOIN domains d ON d.user_id = u.id
        WHERE d.domain=? AND u.is_active=1
        LIMIT 1`, [host]
    );
    const owner = ownerQ[0][0];
    if (!owner) { await conn.rollback(); return res.status(404).json({ error:'owner_not_found' }); }

    const etQ = await conn.execute(
      `SELECT id, duration_min
         FROM event_types
        WHERE user_id=? AND slug=? AND is_active=1
        LIMIT 1`,
      [owner.id, body.data.eventType]
    );
    const et = etQ[0][0];
    if (!et) { await conn.rollback(); return res.status(404).json({ error:'event_type_not_found' }); }

    const startUTC = DateTime.fromISO(body.data.startISO, { zone: 'utc' });
    if (!startUTC.isValid) { await conn.rollback(); return res.status(400).json({ error:'invalid_start' }); }
    const endUTC   = startUTC.plus({ minutes: et.duration_min });

    // Re-chequeo de solapamiento con bloqueo
    const clashQ = await conn.execute(
      `SELECT id FROM bookings
        WHERE user_id=? AND status='confirmed'
          AND starts_at < ? AND ends_at > ?
        FOR UPDATE`,
      [owner.id,
       endUTC.toSQL({ includeOffset:false }),
       startUTC.toSQL({ includeOffset:false })]
    );
    if (clashQ[0].length) {
      await conn.rollback(); return res.status(409).json({ error:'slot_taken' });
    }

    const insQ = await conn.execute(
      `INSERT INTO bookings (user_id, event_type_id, guest_name, guest_email, starts_at, ends_at, status)
       VALUES (?,?,?,?,?,?, 'confirmed')`,
      [owner.id, et.id, body.data.guestName, body.data.guestEmail,
       startUTC.toSQL({ includeOffset:false }),
       endUTC.toSQL({ includeOffset:false })]
    );

    await conn.commit();
    res.json({ ok: true, id: String(insQ[0].insertId) });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

module.exports = r;