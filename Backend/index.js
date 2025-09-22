require('dotenv').config();
const express = require('express');

const morgan = require('morgan');
const { oauthClient, SCOPES, saveTokens } = require('./lib/google');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(morgan('tiny'));
app.use(express.urlencoded({ extended: true }));

// Rutas
app.use('/public', require('./routes/public'));
app.use('/admin',  require('./routes/admin'));
app.get('/oauth/google/callback', async (req,res)=>{
  try {
    const { code, state } = req.query;
    const [userIdStr] = String(state||'').split('|');
    const userId = parseInt(userIdStr,10);
    if(!code || !userId) return res.status(400).send('bad_request');

    const client = oauthClient();
    const { tokens } = await client.getToken(String(code));
    await saveTokens(userId, tokens);

    res.send('<script>window.close && window.close();</script>Conectado. Puedes cerrar esta pestaña.');
  } catch (e) {
    console.error(e); res.status(500).send('oauth_error');
  }
});
app.get('/', (_req, res) => res.json({ ok: true }));
                       // ← importante
const HOST = process.env.API_HOST || '0.0.0.0';
const PORT = +(process.env.API_PORT || 9301);
app.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}`));