const { google } = require('googleapis');
const crypto = require('crypto');
const { pool } = require('../db');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function enc(s){ 
  if(!process.env.TOKENS_CIPHER_KEY) return s;
  const key = Buffer.from(process.env.TOKENS_CIPHER_KEY,'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(s,'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
function dec(s){
  if(!process.env.TOKENS_CIPHER_KEY) return s;
  const buf = Buffer.from(s,'base64');
  const iv = buf.subarray(0,12);
  const tag = buf.subarray(12,28);
  const ct = buf.subarray(28);
  const key = Buffer.from(process.env.TOKENS_CIPHER_KEY,'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

function oauthClient(){
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function saveTokens(userId, tok){
  const conn = await pool.getConnection();
  try {
    const access = tok.access_token ? enc(tok.access_token) : null;
    const refresh= tok.refresh_token ? enc(tok.refresh_token) : null;
    await conn.execute(
      `INSERT INTO google_tokens (user_id,access_token,refresh_token,expiry_date,scope,token_type)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE access_token=VALUES(access_token),
                               refresh_token=COALESCE(VALUES(refresh_token),refresh_token),
                               expiry_date=VALUES(expiry_date),
                               scope=VALUES(scope),
                               token_type=VALUES(token_type)`,
      [userId, access, refresh, tok.expiry_date || null, tok.scope || null, tok.token_type || null]
    );
  } finally { conn.release(); }
}

async function getClientForUser(userId){
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.query(`SELECT * FROM google_tokens WHERE user_id=?`, [userId]);
    if (!row) return null;
    const client = oauthClient();
    client.setCredentials({
      access_token: row.access_token ? dec(row.access_token) : undefined,
      refresh_token: row.refresh_token ? dec(row.refresh_token) : undefined,
      expiry_date: row.expiry_date || undefined,
      scope: row.scope || undefined,
      token_type: row.token_type || undefined,
    });
    // hook para persistir refrescos
    client.on('tokens', async (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        // actualiza expiración para que no caduque
        await saveTokens(userId, tokens);
      }
    });
    return client;
  } finally { conn.release(); }
}

async function insertEvent({ user, booking, eventType }){
  // user: { id, timezone }, booking: { id, starts_at, ends_at, guest_name, guest_email }, eventType: { name }
  const client = await getClientForUser(user.id);
  if (!client) return { ok:false, reason:'no_google_token' };
  const cal = google.calendar({version: 'v3', auth: client});

  // calendario destino
  const conn = await pool.getConnection();
  let calendarId = 'primary';
  try {
    const [[s]] = await conn.query(`SELECT calendar_id,sync_enabled FROM calendar_settings WHERE user_id=?`, [user.id]);
    if (s && s.sync_enabled === 0) return { ok:false, reason:'sync_disabled' };
    if (s && s.calendar_id) calendarId = s.calendar_id;
  } finally { conn.release(); }

  const res = await cal.events.insert({
    calendarId,
    requestBody: {
      summary: `${eventType.name} — ${booking.guest_name}`,
      description: `Reserva #${booking.id} (${eventType.name})`,
      start: { dateTime: new Date(booking.starts_at).toISOString(), timeZone: user.timezone },
      end:   { dateTime: new Date(booking.ends_at).toISOString(),   timeZone: user.timezone },
      attendees: [{ email: booking.guest_email, displayName: booking.guest_name }],
      reminders: { useDefault: true },
    },
    sendUpdates: 'all',                // envía invitaciones por email
    // conferenceDataVersion: 1,       // si quieres generar Google Meet (requiere Workspace)
  });

  return { ok:true, eventId: res.data.id, calendarId };
}

async function updateEvent({ user, google_event_id, google_calendar_id, patch }){
  const client = await getClientForUser(user.id);
  if (!client) return { ok:false, reason:'no_google_token' };
  const cal = google.calendar({version:'v3', auth: client});
  await cal.events.patch({
    calendarId: google_calendar_id || 'primary',
    eventId: google_event_id,
    requestBody: patch,
    sendUpdates: 'all',
  });
  return { ok:true };
}

async function deleteEvent({ user, google_event_id, google_calendar_id }){
  const client = await getClientForUser(user.id);
  if (!client) return { ok:false, reason:'no_google_token' };
  const cal = google.calendar({version:'v3', auth: client});
  await cal.events.delete({
    calendarId: google_calendar_id || 'primary',
    eventId: google_event_id,
    sendUpdates: 'all',
  });
  return { ok:true };
}

module.exports = { oauthClient, SCOPES, saveTokens, getClientForUser, insertEvent, updateEvent, deleteEvent };