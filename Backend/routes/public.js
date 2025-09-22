// routes/public.js
const { Router } = require('express');
const { z } = require('zod');
const { pool } = require('../db');
const { DateTime } = require('luxon');
const { insertEvent } = require('../lib/google');

const r = Router();

/** Lee el tenant desde ?u=... o header X-Owner-User */
function getUserSlug(req) {
  const q = (req.query.u || '').toString().trim().toLowerCase();
  if (q) return q;
  const h = (req.get('x-owner-user') || '').toString().trim().toLowerCase();
  if (h) return h;
  return '';
}

/** Busca el owner por slug (usuario/tenant) */
async function getOwnerByUser(conn, userSlug) {
  const [rows] = await conn.execute(
    `SELECT u.id, u.slug, u.name, u.email, u.timezone,
            b.favicon, b.logo, b.primary_hex, b.bg_hex, b.fg_hex
       FROM users u
  LEFT JOIN branding b ON b.user_id = u.id
      WHERE u.slug = ? AND u.is_active = 1
      LIMIT 1`,
    [userSlug]
  );
  return rows[0] || null;
}

/** GET /public/profile?u=... */
r.get('/profile', async (req, res) => {
  const userSlug = getUserSlug(req);
  if (!userSlug) return res.status(400).json({ error: 'user_required' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByUser(conn, userSlug);
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

/** GET /public/event-types?u=... */

r.get('/event-types', async (req, res) => {
  const userSlug = getUserSlug(req);
  if (!userSlug) return res.status(400).json({ error: 'user_required' });

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByUser(conn, userSlug);
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

/** GET /public/slots?u=...&eventType=...&date=YYYY-MM-DD */
r.get("/slots", async (req, res) => {
  const userSlug = getUserSlug(req);

  const parsed = z.object({
    eventType: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).safeParse({ eventType: req.query.eventType, date: req.query.date });

  if (!userSlug) return res.status(400).json({ error: "user_required" });
  if (!parsed.success) return res.status(400).json({ error: "bad_request" });

  const { eventType, date } = parsed.data;

  const conn = await pool.getConnection();
  try {
    const owner = await getOwnerByUser(conn, userSlug);
    if (!owner) return res.status(404).json({ error: "owner_not_found" });

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

    const dayStart = DateTime.fromISO(date, { zone: owner.timezone }).startOf("day");
    const dayEnd   = dayStart.endOf("day");
    const startSQL = dayStart.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");
    const endSQL   = dayEnd.toUTC().toFormat("yyyy-LL-dd HH:mm:ss.SSS");

    const weekday = dayStart.weekday % 7; // 0=Dom .. 6=Sáb

    const [availRows] = await conn.execute(
      `SELECT start_min, end_min
         FROM availability
        WHERE user_id=? AND weekday=?
        ORDER BY start_min ASC`,
      [owner.id, weekday]
    );
    if (availRows.length === 0) return res.json({ slots: [] });

    const [bkRows] = await conn.execute(
      `SELECT b.starts_at, b.ends_at, et.buffer_min AS booking_buffer_min
         FROM bookings b
         JOIN event_types et ON et.id = b.event_type_id
        WHERE b.user_id=? AND b.status <> 'cancelled'
          AND b.starts_at < ? AND b.ends_at > ?`,
      [owner.id, endSQL, startSQL]
    );

    const dayStartMs = dayStart.toUTC().toMillis();
    const bookings = bkRows.map(row => ({
      startMs: new Date(row.starts_at).getTime(),
      endMs:   new Date(row.ends_at).getTime(),
      bufferAfterMs: Number(row.booking_buffer_min || 0) * 60000
    }));

    const durationMs = durationMin * 60000;
    const bufferAfterMs = bufferMin * 60000;
    const stepMs = durationMs;

    const slots = [];

    for (const a of availRows) {
      const rangeStartMs = dayStartMs + Number(a.start_min) * 60000;
      const rangeEndMs   = dayStartMs + Number(a.end_min)   * 60000;

      for (let s = rangeStartMs; s + durationMs + bufferAfterMs <= rangeEndMs + 1; s += stepMs) {
        const sEndPadded = s + durationMs + bufferAfterMs;

        let ok = true;
        for (const b of bookings) {
          const bEndPadded = b.endMs + b.bufferAfterMs;
          if (s < bEndPadded && sEndPadded > b.startMs) { ok = false; break; }
        }
        if (!ok) continue;

        const iso = new Date(s).toISOString(); // UTC
        const label = new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        slots.push({ iso, label });
      }
    }

    slots.sort((a,b) => new Date(a.iso).getTime() - new Date(b.iso).getTime());
    res.json({ slots });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  } finally {
    conn.release();
  }
});

/** POST /public/book?u=...
 * body: { eventType, guestName, guestEmail, startISO(UTC) }
 */
r.post('/book', async (req, res) => {
  const body = z.object({
    eventType: z.string(),
    guestName: z.string().min(1),
    guestEmail: z.string().email(),
    startISO: z.string() // en UTC
  }).safeParse(req.body);

  const userSlug = getUserSlug(req);
  if (!userSlug) return res.status(400).json({ error: 'user_required' });
  if (!body.success) return res.status(400).json({ error: 'bad_request' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const owner = (await conn.execute(
      `SELECT u.id, u.timezone
         FROM users u
        WHERE u.slug=? AND u.is_active=1
        LIMIT 1`, [userSlug]
    ))[0][0];
    if (!owner) { await conn.rollback(); return res.status(404).json({ error:'owner_not_found' }); }

    const et = (await conn.execute(
      `SELECT id, name, duration_min
         FROM event_types
        WHERE user_id=? AND slug=? AND is_active=1
        LIMIT 1`,
      [owner.id, body.data.eventType]
    ))[0][0];
    if (!et) { await conn.rollback(); return res.status(404).json({ error:'event_type_not_found' }); }

    const startUTC = DateTime.fromISO(body.data.startISO, { zone: 'utc' });
    if (!startUTC.isValid) { await conn.rollback(); return res.status(400).json({ error:'invalid_start' }); }
    const endUTC   = startUTC.plus({ minutes: et.duration_min });

    const clashQ = await conn.execute(
      `SELECT id FROM bookings
        WHERE user_id=? AND status='confirmed'
          AND starts_at < ? AND ends_at > ?
        FOR UPDATE`,
      [owner.id,
       startUTC.plus({ minutes: et.duration_min }).toSQL({ includeOffset:false }),
       startUTC.toSQL({ includeOffset:false })]
    );
    if (clashQ[0].length) {
      await conn.rollback(); return res.status(409).json({ error:'slot_taken' });
    }

    const [ins] = await conn.execute(
      `INSERT INTO bookings (user_id, event_type_id, guest_name, guest_email, starts_at, ends_at, status)
       VALUES (?,?,?,?,?,?, 'confirmed')`,
      [owner.id, et.id, body.data.guestName, body.data.guestEmail,
       startUTC.toSQL({ includeOffset:false }),
       endUTC.toSQL({ includeOffset:false })]
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
        await conn.execute(
          `UPDATE bookings SET google_event_id=?, google_calendar_id=? WHERE id=?`,
          [sync.eventId, sync.calendarId, bookingId]
        );
      } else if (sync && !sync.ok) {
        console.warn('google sync skipped:', sync.reason);
      }
    } catch (e) {
      console.error('google sync error:', e);
      // no rollback: la reserva ya quedó confirmada
    }

    res.json({ ok: true, id: String(bookingId) });
  } catch (e) {
    console.error(e);
    try { await conn.rollback(); } catch {}
    res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
});

/** ICS download (no varía por u, pero mantiene lógica existente) */
r.get('/booking/:id/ics', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).send('bad_request');

  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT b.id, b.guest_name, b.guest_email, b.starts_at, b.ends_at,
              et.name AS event_name, u.name AS owner_name
         FROM bookings b
         JOIN event_types et ON et.id=b.event_type_id
         JOIN users u        ON u.id=b.user_id
        WHERE b.id=? LIMIT 1`, [id]
    );
    const bk = rows[0];
    if (!bk) return res.status(404).send('not_found');

    const s = new Date(bk.starts_at), e = new Date(bk.ends_at);

    const ics =
`BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//MyAgenda//EN
METHOD:REQUEST
BEGIN:VEVENT
UID:booking-${bk.id}@myagenda
DTSTAMP:${s.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
DTSTART:${s.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
DTEND:${e.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
SUMMARY:${bk.event_name} — ${bk.guest_name}
DESCRIPTION:Reserva #${bk.id} con ${bk.owner_name}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="booking-${bk.id}.ics"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(ics);
  } finally { conn.release(); }
});

module.exports = r;
