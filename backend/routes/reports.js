import express from 'express';
import { Parser as CsvParser } from 'json2csv';
import { db } from '../db/index.js';
import { authenticate, authorize, writeAudit } from '../middleware/auth.js';
import { maskRow, maskRows } from '../utils/mask.js';

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
// Community-level rows have no block/flat; Block-level have a block but no
// floor/flat; Floor-level have block+floor but no flat; Flat-level have all
// three. LEFT JOINs mean the non-applicable columns come back blank, exactly
// as the "display only applicable location fields" requirement describes.
router.get('/incidents', (req, res) => {
  const { from, to, block_id, category_id, maker_id, status, incident_level, floor } = req.query;
  let q = `
    SELECT i.incident_number, i.incident_date, i.incident_time, i.incident_level,
           b.name as block, i.floor, f.flat_number,
           f.resident_name, vc.name as category, i.status, i.resolution,
           m.name as maker, s.name as supervisor, i.remarks, i.supervisor_remarks
    FROM incidents i
    LEFT JOIN blocks b ON b.id=i.block_id
    LEFT JOIN flats f ON f.id=i.flat_id
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
  if (incident_level) { q += ' AND i.incident_level=?'; params.push(incident_level); }
  if (floor) { q += ' AND i.floor=?'; params.push(floor); }
  q += ' ORDER BY i.incident_date DESC';
  const rows = db.prepare(q).all(...params);
  // No mobile/email columns are selected in this report, so no masking is needed here.
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
    LEFT JOIN incidents i ON i.block_id=b.id AND i.status='Approved' AND i.incident_level IN ('Block','Floor','Flat')
    WHERE b.community_id=?
    GROUP BY b.id ORDER BY b.name
  `).all(req.user.communityId);

  // Incident-level totals across the whole community, independent of block breakdown
  // (Community-level incidents have no block, so they can only surface here).
  const levelTotals = db.prepare(`
    SELECT incident_level,
      COUNT(*) as total_violations,
      SUM(CASE WHEN resolution='Warning' THEN 1 ELSE 0 END) as warnings,
      SUM(CASE WHEN resolution='Penalty' THEN 1 ELSE 0 END) as penalties
    FROM incidents WHERE community_id=? GROUP BY incident_level
  `).all(req.user.communityId);
  const totals = { Community: 0, Block: 0, Floor: 0, Flat: 0 };
  levelTotals.forEach(l => { totals[l.incident_level] = l.total_violations; });

  if (maybeExportCsv(req, res, rows, 'block_summary.csv')) return;
  res.json({ blocks: rows, levelTotals: totals });
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

  const wantsUnmask = req.query.unmask === 'true' || req.query.unmask === '1';
  if (wantsUnmask) {
    if (req.user.role !== 'Administrator') {
      return res.status(403).json({ error: 'Only administrators may view unmasked contact information' });
    }
    writeAudit({
      userId: req.user.id, action: 'REVEAL_PII', entityType: 'flat', entityId: flat.id,
      details: { via: 'resident_history_report', reason: req.query.reason || null }, ip: req.ip
    });
    return res.json({ flat, incidents, penalties });
  }
  res.json({ flat: maskRow(flat), incidents, penalties });
});

// Consolidated Report: Community -> Block -> Floor -> Flat rollup with totals at every level
router.get('/consolidated', (req, res) => {
  const communityId = req.user.communityId;
  const community = db.prepare('SELECT * FROM communities WHERE id=?').get(communityId);

  const communityIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents
    WHERE community_id=? AND incident_level='Community'`).get(communityId).c;

  const blocks = db.prepare('SELECT * FROM blocks WHERE community_id=? ORDER BY name').all(communityId);
  const blockTree = blocks.map(block => {
    const blockIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents
      WHERE block_id=? AND incident_level='Block'`).get(block.id).c;

    const floorRows = db.prepare(`SELECT DISTINCT floor FROM incidents
      WHERE block_id=? AND incident_level IN ('Floor','Flat') AND floor IS NOT NULL ORDER BY floor`).all(block.id);

    const floors = floorRows.map(({ floor }) => {
      const floorIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents
        WHERE block_id=? AND floor=? AND incident_level='Floor'`).get(block.id, floor).c;

      const flats = db.prepare(`SELECT DISTINCT f.id, f.flat_number FROM incidents i
        JOIN flats f ON f.id=i.flat_id
        WHERE i.block_id=? AND i.floor=? AND i.incident_level='Flat' ORDER BY f.flat_number`).all(block.id, floor);

      const flatNodes = flats.map(f => {
        const flatIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE flat_id=? AND incident_level='Flat'`).get(f.id).c;
        return { flatId: f.id, flatNumber: f.flat_number, incidentCount: flatIncidents };
      });
      const flatTotal = flatNodes.reduce((s, f) => s + f.incidentCount, 0);

      return { floor, incidentCount: floorIncidents, flats: flatNodes, total: floorIncidents + flatTotal };
    });

    // Flat-level incidents whose flat has no floor on file still need to be represented
    const flatsWithoutFloor = db.prepare(`SELECT DISTINCT f.id, f.flat_number FROM incidents i
      JOIN flats f ON f.id=i.flat_id
      WHERE i.block_id=? AND i.incident_level='Flat' AND i.floor IS NULL ORDER BY f.flat_number`).all(block.id);
    if (flatsWithoutFloor.length > 0) {
      const flatNodes = flatsWithoutFloor.map(f => {
        const flatIncidents = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE flat_id=? AND incident_level='Flat' AND floor IS NULL`).get(f.id).c;
        return { flatId: f.id, flatNumber: f.flat_number, incidentCount: flatIncidents };
      });
      floors.push({ floor: 'Unspecified', incidentCount: 0, flats: flatNodes, total: flatNodes.reduce((s, f) => s + f.incidentCount, 0) });
    }

    const floorsTotal = floors.reduce((s, f) => s + f.total, 0);
    return { blockId: block.id, blockName: block.name, incidentCount: blockIncidents, floors, total: blockIncidents + floorsTotal };
  });

  const blocksTotal = blockTree.reduce((s, b) => s + b.total, 0);
  const grandTotal = communityIncidents + blocksTotal;

  res.json({
    community: { id: community.id, name: community.name, incidentCount: communityIncidents },
    blocks: blockTree,
    grandTotal,
  });
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
