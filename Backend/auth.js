// auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieName = 'dapp_rt'; // nombre de la cookie de refresh

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const REFRESH_TTL_DAYS = 30;
const ACCESS_TTL = '15m';

function signAccessToken(uid) {
  return jwt.sign({ uid: String(uid) }, SECRET, { expiresIn: ACCESS_TTL });
}

function newJti() {
  return crypto.randomUUID();
}

function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: true,           // en prod con HTTPS
    sameSite: 'none',       // porque usas booking.<domain> → api.<domain>
    path: '/admin/refresh', // la cookie solo viaja al endpoint de refresh
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000
  };
}

function requireAuth(req, res, next) {
  const h = req.get('Authorization') || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(m[1], SECRET);
    req.auth = { uid: String(payload.uid) };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = {
  SECRET,
  cookieName,
  signAccessToken,
  newJti,
  refreshCookieOptions,
  requireAuth
};
