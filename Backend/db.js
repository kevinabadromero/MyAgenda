const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'myagenda',
  connectionLimit: 10
});

// Fuerza UTC en cada conexión (por si el servidor cambia de tz)
pool.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});

module.exports = { pool };