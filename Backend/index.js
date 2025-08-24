require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(morgan('tiny'));

// CORS
const allowed = (process.env.ALLOWED_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowed.includes('*') || allowed.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS: ' + origin));
  },
  methods: ['GET','POST','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization','X-Owner-Host'],
}));

// Rutas
app.use('/public', require('./routes/public'));
app.get('/health', (_req, res) => res.json({ ok: true }));

const HOST = process.env.API_HOST || '0.0.0.0';
const PORT = +(process.env.API_PORT || 9301);
app.listen(PORT, HOST, () => console.log(`API listening on http://${HOST}:${PORT}`));