// auth.js
const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function signToken(uid) {
  return jwt.sign({ uid: String(uid) }, SECRET, { expiresIn: '7d' });
}

function requireAuth(req, res, next) {
  const h = req.get('Authorization') || '';
  const m = h.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(m[1], SECRET);
    req.auth = { uid: String(payload.uid) };
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = { signToken, requireAuth };