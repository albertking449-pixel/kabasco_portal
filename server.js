require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());               // for production, restrict this to your portal's actual origin
app.use(express.json({ limit: '5mb' }));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'kabalega_portal',
  waitForConnections: true,
  connectionLimit: 5,
});

// Health check
app.get('/', (req, res) => res.json({ ok: true, service: 'kabalega-portal-api' }));

// Fetch the whole portal state (one JSON document, mirrors what the front end used to
// keep in browser storage — see README for why, and how to normalize this later).
app.get('/api/state', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT data FROM portal_state WHERE id = 1');
    if (rows.length === 0) return res.json({});
    const raw = rows[0].data;
    res.json(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load portal state' });
  }
});

// Replace the whole portal state. The front end sends its full in-memory snapshot
// on every save, so this is a simple upsert of a single row.
app.post('/api/state', async (req, res) => {
  try {
    const json = JSON.stringify(req.body);
    await pool.query(
      `INSERT INTO portal_state (id, data) VALUES (1, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = CURRENT_TIMESTAMP`,
      [json]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save portal state' });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Kabalega portal API listening on port ${PORT}`));
