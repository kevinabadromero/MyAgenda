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
r.get('/slots', async (req, res) => {
  const q = z.object({
    host: z.string().optional(),
    eventType: z.string(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).safeParse({ ...req.query });
  if (!q.success) return res.status(400).json({ error: 'bad_request' });

  const host = q.data.host || getHost(req);
  const conn = await pool.getConnection();

  try {
    const owner = await getOwnerByHost(conn, host);
    if (!owner) return res.status(404).json({ error: 'owner_not_found' });

    const [etr] = await conn.execute(
      `SELECT id, name, duration_min, buffer_min
         FROM event_types
        WHERE user_id=? AND slug=? AND is_active=1
        LIMIT 1`,
      [owner.id, q.data.eventType]
    );
    const et = etr[0];
    if (!et) return res.status(404).json({ error: 'event_type_not_found' });

    // weekday 0..6 (Dom=0) en TZ del owner
    let wd = DateTime.fromISO(q.data.date, { zone: owner.timezone }).weekday; // 1..7 (Mon..Sun)
    wd = wd % 7;

    const [avRows] = await conn.execute(
      `SELECT start_min, end_min
         FROM availability
        WHERE user_id=? AND weekday=?`,
      [owner.id, wd]
    );

    // Rango del día en UTC (para traer bookings solapados)
    const { startUTC, endUTC } = dayBoundsUTC(q.data.date, owner.timezone);

    const [bkRows] = await conn.execute(
      `SELECT starts_at, ends_at
         FROM bookings
        WHERE user_id=?
          AND status='confirmed'
          AND starts_at < ?
          AND ends_at   > ?`,
      [owner.id,
       endUTC.toSQL({ includeOffset:false }),
       startUTC.toSQL({ includeOffset:false })]
    );

    const busy = bkRows.map(b => ([
      DateTime.fromSQL(b.starts_at, { zone: 'utc' }),
      DateTime.fromSQL(b.ends_at,   { zone: 'utc' })
    ]));

    const step = et.duration_min;
    const buffer = et.buffer_min || 0;
    const leadMin = 30;
    const nowUTC = DateTime.utc();

    const out = [];
    const baseLocal = DateTime.fromISO(q.data.date, { zone: owner.timezone }).startOf('day');

    for (const a of avRows) {
      for (let t = a.start_min; t + step <= a.end_min; t += (step + buffer)) {
        const startLocal = baseLocal.plus({ minutes: t });
        const endLocal   = startLocal.plus({ minutes: step });

        const startUTCslot = startLocal.toUTC();
        const endUTCslot   = endLocal.toUTC();

        if (startUTCslot.diff(nowUTC, 'minutes').minutes < leadMin) continue;

        const overlaps = busy.some(([s,e]) => startUTCslot < e && endUTCslot > s);
        if (!overlaps) {
          out.push({ iso: startUTCslot.toISO(), label: startLocal.toFormat('HH:mm') });
        }
      }
    }
    res.json({ slots: out });
  } catch (e) {
    console.error(e); res.status(500).json({ error: 'internal_error' });
  } finally { conn.release(); }
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