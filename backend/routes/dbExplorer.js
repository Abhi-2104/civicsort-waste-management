import express from 'express';
import { db } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Secure: Only Administrator can access database explorer endpoints
router.use(authenticate);
router.use(authorize('Administrator'));

// Get all tables in the SQLite database
router.get('/tables', (req, res) => {
  try {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    res.json(tables.map(t => t.name));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get schema and row data for a specific table
router.get('/tables/:name', (req, res) => {
  const { name } = req.params;
  const limit = parseInt(req.query.limit, 10) || 100;
  const offset = parseInt(req.query.offset, 10) || 0;

  try {
    // 1. Get column details
    const columns = db.prepare(`PRAGMA table_info("${name}")`).all();

    // 2. Fetch rows (secure interpolation since table name is verified from sqlite_master)
    const validTables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(t => t.name);
    if (!validTables.includes(name)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    const rows = db.prepare(`SELECT * FROM "${name}" LIMIT ? OFFSET ?`).all(limit, offset);
    const count = db.prepare(`SELECT COUNT(*) as total FROM "${name}"`).get().total;

    res.json({
      columns: columns.map(c => ({ name: c.name, type: c.type, pk: c.pk })),
      rows,
      total: count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Run a custom SQL query (Restricted to read-only SELECT queries for safety)
router.post('/query', (req, res) => {
  const { sql } = req.body;
  if (!sql) return res.status(400).json({ error: 'SQL query is required' });

  // Safety block: prevent modifying table data
  const normalizedSql = sql.trim().toLowerCase();
  const safe = normalizedSql.startsWith('select') || normalizedSql.startsWith('pragma') || normalizedSql.startsWith('explain');
  if (!safe) {
    return res.status(403).json({ error: 'Only read-only queries (SELECT) are permitted in this console.' });
  }

  try {
    const rows = db.prepare(sql).all();
    // Derive columns dynamically from keys of the first row
    const columns = rows.length > 0 ? Object.keys(rows[0]).map(k => ({ name: k })) : [];
    res.json({ columns, rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
