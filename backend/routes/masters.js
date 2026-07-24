import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { authenticate, authorize, writeAudit } from '../middleware/auth.js';
import { maskRow, maskRows } from '../utils/mask.js';

const router = express.Router();
router.use(authenticate);

// ---------- Community ----------
router.get('/community', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=?').get(req.user.communityId);
  res.json(c);
});

router.put('/community', authorize('Administrator'), (req, res) => {
  const { name, address, contact_phone, contact_email, logo_url } = req.body;
  db.prepare(`UPDATE communities SET name=?, address=?, contact_phone=?, contact_email=?, logo_url=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, address, contact_phone, contact_email, logo_url, req.user.communityId);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'community', entityId: req.user.communityId, ip: req.ip });
  res.json({ ok: true });
});

// ---------- Blocks ----------
router.get('/blocks', (req, res) => {
  const rows = db.prepare('SELECT * FROM blocks WHERE community_id=? ORDER BY name').all(req.user.communityId);
  res.json(rows);
});

router.post('/blocks', authorize('Administrator'), (req, res) => {
  const { name, ward, street } = req.body;
  if (!name) return res.status(400).json({ error: 'Block name is required' });
  try {
    const info = db.prepare('INSERT INTO blocks (community_id, name, ward, street) VALUES (?, ?, ?, ?)')
      .run(req.user.communityId, name, ward || null, street || null);
    writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'block', entityId: info.lastInsertRowid, ip: req.ip });
    res.status(201).json(db.prepare('SELECT * FROM blocks WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'A block with this name already exists' });
  }
});

router.put('/blocks/:id', authorize('Administrator'), (req, res) => {
  const { name, ward, street, is_active } = req.body;
  db.prepare('UPDATE blocks SET name=?, ward=?, street=?, is_active=? WHERE id=? AND community_id=?')
    .run(name, ward, street, is_active ? 1 : 0, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'block', entityId: req.params.id, ip: req.ip });
  res.json(db.prepare('SELECT * FROM blocks WHERE id=?').get(req.params.id));
});

// ---------- Flats ----------
// Mobile number and email are masked by default everywhere, per the privacy
// enhancement. Administrators can reveal a specific flat's real contact
// details via GET /flats/:id?unmask=true — every reveal is written to the
// audit log with the requesting user, timestamp, and optional reason.
router.get('/flats', (req, res) => {
  const { block_id, search } = req.query;
  let q = `SELECT f.*, b.name as block_name FROM flats f JOIN blocks b ON b.id=f.block_id WHERE f.community_id=?`;
  const params = [req.user.communityId];
  if (block_id) { q += ' AND f.block_id=?'; params.push(block_id); }
  if (search) {
    q += ' AND (f.flat_number LIKE ? OR f.resident_name LIKE ? OR f.mobile_number LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY b.name, f.flat_number';
  res.json(maskRows(db.prepare(q).all(...params)));
});

router.get('/flats/:id', (req, res) => {
  const flat = db.prepare(`SELECT f.*, b.name as block_name FROM flats f JOIN blocks b ON b.id=f.block_id
    WHERE f.id=? AND f.community_id=?`).get(req.params.id, req.user.communityId);
  if (!flat) return res.status(404).json({ error: 'Flat not found' });

  const wantsUnmask = req.query.unmask === 'true' || req.query.unmask === '1';
  if (wantsUnmask) {
    if (req.user.role !== 'Administrator') {
      return res.status(403).json({ error: 'Only administrators may view unmasked contact information' });
    }
    writeAudit({
      userId: req.user.id, action: 'REVEAL_PII', entityType: 'flat', entityId: flat.id,
      details: { reason: req.query.reason || null, fields: ['mobile_number', 'email'] }, ip: req.ip
    });
    return res.json(flat); // real values, unmasked
  }
  res.json(maskRow(flat));
});

router.post('/flats', authorize('Administrator'), (req, res) => {
  const { block_id, floor, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status } = req.body;
  if (!block_id || !flat_number) return res.status(400).json({ error: 'Block and flat number are required' });
  try {
    const info = db.prepare(`INSERT INTO flats
      (community_id, block_id, floor, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.communityId, block_id, floor || null, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status || 'Occupied');
    writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'flat', entityId: info.lastInsertRowid, ip: req.ip });
    res.status(201).json(maskRow(db.prepare('SELECT * FROM flats WHERE id=?').get(info.lastInsertRowid)));
  } catch (e) {
    res.status(400).json({ error: 'This flat number already exists in the selected block' });
  }
});

router.put('/flats/:id', authorize('Administrator'), (req, res) => {
  const { owner_name, resident_name, mobile_number, email, occupancy_status, is_active, floor } = req.body;
  db.prepare(`UPDATE flats SET owner_name=?, resident_name=?, mobile_number=?, email=?, occupancy_status=?, is_active=?, floor=?, updated_at=datetime('now')
    WHERE id=? AND community_id=?`)
    .run(owner_name, resident_name, mobile_number, email, occupancy_status, is_active ? 1 : 0, floor || null, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'flat', entityId: req.params.id, ip: req.ip });
  res.json(maskRow(db.prepare('SELECT * FROM flats WHERE id=?').get(req.params.id)));
});

// ---------- Users ----------
router.get('/users', authorize('Administrator'), (req, res) => {
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.mobile_number, u.is_active, r.name as role
    FROM users u JOIN roles r ON r.id=u.role_id WHERE u.community_id=? ORDER BY u.name`).all(req.user.communityId);
  res.json(rows);
});

router.post('/users', authorize('Administrator'), (req, res) => {
  const { name, email, mobile_number, password, role } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ error: 'Name, email, password, and role are required' });
  const roleRow = db.prepare('SELECT id FROM roles WHERE name=?').get(role);
  if (!roleRow) return res.status(400).json({ error: 'Invalid role' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`INSERT INTO users (community_id, name, email, mobile_number, password_hash, role_id)
      VALUES (?, ?, ?, ?, ?, ?)`).run(req.user.communityId, name, email, mobile_number || null, hash, roleRow.id);
    writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'user', entityId: info.lastInsertRowid, ip: req.ip });
    res.status(201).json({ id: info.lastInsertRowid, name, email, role });
  } catch (e) {
    res.status(400).json({ error: 'A user with this email already exists' });
  }
});

router.put('/users/:id', authorize('Administrator'), (req, res) => {
  const { name, mobile_number, role, is_active } = req.body;
  const roleRow = db.prepare('SELECT id FROM roles WHERE name=?').get(role);
  db.prepare('UPDATE users SET name=?, mobile_number=?, role_id=?, is_active=? WHERE id=? AND community_id=?')
    .run(name, mobile_number, roleRow ? roleRow.id : null, is_active ? 1 : 0, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'user', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// ---------- Violation categories ----------
router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM violation_categories WHERE community_id=? ORDER BY name').all(req.user.communityId));
});

router.post('/categories', authorize('Administrator'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const info = db.prepare('INSERT INTO violation_categories (community_id, name, description) VALUES (?, ?, ?)')
    .run(req.user.communityId, name, description || null);
  writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'violation_category', entityId: info.lastInsertRowid, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM violation_categories WHERE id=?').get(info.lastInsertRowid));
});

router.put('/categories/:id', authorize('Administrator'), (req, res) => {
  const { name, description, is_active } = req.body;
  db.prepare('UPDATE violation_categories SET name=?, description=?, is_active=? WHERE id=? AND community_id=?')
    .run(name, description, is_active ? 1 : 0, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'violation_category', entityId: req.params.id, ip: req.ip });
  res.json(db.prepare('SELECT * FROM violation_categories WHERE id=?').get(req.params.id));
});

// ---------- Penalty rules ----------
router.get('/penalty-rules', (req, res) => {
  const rows = db.prepare(`SELECT pr.*, vc.name as category_name FROM penalty_rules pr
    JOIN violation_categories vc ON vc.id = pr.category_id WHERE vc.community_id=? ORDER BY vc.name`).all(req.user.communityId);
  res.json(rows);
});

router.post('/penalty-rules', authorize('Administrator'), (req, res) => {
  const { category_id, warnings_before_penalty, penalty_amount, effective_date } = req.body;
  if (!category_id || penalty_amount == null || !effective_date) {
    return res.status(400).json({ error: 'Category, penalty amount, and effective date are required' });
  }
  const info = db.prepare(`INSERT INTO penalty_rules (category_id, warnings_before_penalty, penalty_amount, effective_date)
    VALUES (?, ?, ?, ?)`).run(category_id, warnings_before_penalty ?? 1, penalty_amount, effective_date);
  writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'penalty_rule', entityId: info.lastInsertRowid, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM penalty_rules WHERE id=?').get(info.lastInsertRowid));
});

router.put('/penalty-rules/:id', authorize('Administrator'), (req, res) => {
  const { warnings_before_penalty, penalty_amount, effective_date, is_active } = req.body;
  db.prepare(`UPDATE penalty_rules SET warnings_before_penalty=?, penalty_amount=?, effective_date=?, is_active=? WHERE id=?`)
    .run(warnings_before_penalty, penalty_amount, effective_date, is_active ? 1 : 0, req.params.id);
  writeAudit({ userId: req.user.id, action: 'UPDATE', entityType: 'penalty_rule', entityId: req.params.id, ip: req.ip });
  res.json(db.prepare('SELECT * FROM penalty_rules WHERE id=?').get(req.params.id));
});

export default router;
