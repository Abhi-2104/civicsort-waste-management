import express from 'express';
import { Parser as CsvParser } from 'json2csv';
import { db } from '../db/index.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

function maybeExportCsv(req, res, rows, filename) {
  if (req.query.export === 'csv') {
    if (rows.length === 0) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send('');
    }
    const parser = new CsvParser();
    const csv = parser.parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csv);
  }
  return null;
}

// Report 1: Incident Report
router.get('/incidents', (req, res) => {
  const { from, to, block_id, category_id, maker_id, status } = req.query;
  let q = `
    SELECT i.incident_number, i.incident_date, i.incident_time, b.name as block, f.flat_number,
           f.resident_name, vc.name as category, i.status, i.resolution,
           m.name as maker, s.name as supervisor, i.remarks, i.supervisor_remarks
    FROM incidents i
    JOIN blocks b ON b.id=i.block_id
    JOIN flats f ON f.id=i.flat_id
    JOIN violation_categories vc ON vc.id=i.category_id
    JOIN users m ON m.id=i.maker_id
    LEFT JOIN users s ON s.id=i.supervisor_id
    WHERE i.community_id=?`;
  const params = [req.user.communityId];
  if (from) { q += ' AND i.incident_date>=?'; params.push(from); }
  if (to) { q += ' AND i.incident_date<=?'; params.push(to); }
  if (block_id) { q += ' AND i.block_id=?'; params.push(block_id); }
  if (category_id) { q += ' AND i.category_id=?'; params.push(category_id); }
  if (maker_id) { q += ' AND i.maker_id=?'; params.push(maker_id); }
  if (status) { q += ' AND i.status=?'; params.push(status); }
  q += ' ORDER BY i.incident_date DESC';
  const rows = db.prepare(q).all(...params);
  if (maybeExportCsv(req, res, rows, 'incident_report.csv')) return;
  res.json(rows);
});

// Report 2: Penalty Report
router.get('/penalties', (req, res) => {
  const { from, to, status } = req.query;
  let q = `
    SELECT p.penalty_number, f.flat_number, f.resident_name, vc.name as category,
           p.penalty_date, p.penalty_amount, p.status
    FROM penalties p
    JOIN flats f ON f.id=p.flat_id
    JOIN violation_categories vc ON vc.id=p.category_id
    WHERE f.community_id=?`;
  const params = [req.user.communityId];
  if (from) { q += ' AND p.penalty_date>=?'; params.push(from); }
  if (to) { q += ' AND p.penalty_date<=?'; params.push(to); }
  if (status) { q += ' AND p.status=?'; params.push(status); }
  q += ' ORDER BY p.penalty_date DESC';
  const rows = db.prepare(q).all(...params);
  const total = rows.reduce((s, r) => s + r.penalty_amount, 0);
  if (maybeExportCsv(req, res, rows, 'penalty_report.csv')) return;
  res.json({ rows, total });
});

router.put('/penalties/:id/pay', (req, res) => {
  db.prepare(`UPDATE penalties SET status='Paid', paid_at=datetime('now') WHERE id=?`).run(req.params.id);
  res.json({ ok: true });
});

// Report 3: Block-wise summary (no individual flat details)
router.get('/block-summary', (req, res) => {
  const rows = db.prepare(`
    SELECT b.name as block,
      COUNT(DISTINCT i.id) as total_violations,
      SUM(CASE WHEN i.resolution='Warning' THEN 1 ELSE 0 END) as warnings,
      SUM(CASE WHEN i.resolution='Penalty' THEN 1 ELSE 0 END) as penalties,
      COALESCE((SELECT SUM(p.penalty_amount) FROM penalties p WHERE p.flat_id IN
        (SELECT id FROM flats WHERE block_id=b.id)), 0) as penalty_amount
    FROM blocks b
    LEFT JOIN incidents i ON i.block_id=b.id AND i.status='Approved'
    WHERE b.community_id=?
    GROUP BY b.id ORDER BY b.name
  `).all(req.user.communityId);
  if (maybeExportCsv(req, res, rows, 'block_summary.csv')) return;
  res.json(rows);
});

// Report 4: Resident history (with photos)
router.get('/resident/:flatId', (req, res) => {
  const flat = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=?').get(req.params.flatId, req.user.communityId);
  if (!flat) return res.status(404).json({ error: 'Flat not found' });
  const incidents = db.prepare(`
    SELECT i.*, vc.name as category_name FROM incidents i
    JOIN violation_categories vc ON vc.id=i.category_id
    WHERE i.flat_id=? ORDER BY i.incident_date DESC`).all(req.params.flatId);
  const photoStmt = db.prepare('SELECT * FROM incident_photos WHERE incident_id=?');
  incidents.forEach(inc => { inc.photos = photoStmt.all(inc.id); });
  const penalties = db.prepare('SELECT * FROM penalties WHERE flat_id=? ORDER BY penalty_date DESC').all(req.params.flatId);
  res.json({ flat, incidents, penalties });
});

// Report 5: Violation trend (monthly/weekly/yearly)
router.get('/trend', (req, res) => {
  const grouping = req.query.by || 'monthly'; // monthly | weekly | yearly
  let fmt = '%Y-%m';
  if (grouping === 'weekly') fmt = '%Y-W%W';
  if (grouping === 'yearly') fmt = '%Y';
  const rows = db.prepare(`
    SELECT strftime('${fmt}', incident_date) as period, COUNT(*) as count,
      SUM(CASE WHEN resolution='Warning' THEN 1 ELSE 0 END) as warnings,
      SUM(CASE WHEN resolution='Penalty' THEN 1 ELSE 0 END) as penalties
    FROM incidents WHERE community_id=? AND status='Approved'
    GROUP BY period ORDER BY period
  `).all(req.user.communityId);

  const byCategory = db.prepare(`
    SELECT vc.name as category, COUNT(*) as count
    FROM incidents i JOIN violation_categories vc ON vc.id=i.category_id
    WHERE i.community_id=? AND i.status='Approved'
    GROUP BY vc.name ORDER BY count DESC
  `).all(req.user.communityId);

  res.json({ trend: rows, byCategory });
});

export default router;
