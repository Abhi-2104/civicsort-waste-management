import express from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { authenticate, authorize, writeAudit } from '../middleware/auth.js';
import { maskRow, maskRows } from '../utils/mask.js';

const router = express.Router();
router.use(authenticate);

// ── Validation helpers ──────────────────────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[+]?\d[\d\s\-]{7,15}$/;

function validateEmail(email) {
  if (!email) return null;
  return EMAIL_RE.test(email) ? null : 'Invalid email format';
}

function validateMobile(mobile) {
  if (!mobile) return null;
  return MOBILE_RE.test(mobile) ? null : 'Invalid mobile number format';
}

// ── Audit helper — extracts user info from req for enriched audit ───────────
function auditCtx(req) {
  return { userName: req.user.name, userRole: req.user.role };
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMUNITY MASTER (Enhancement 14)
// ══════════════════════════════════════════════════════════════════════════════

// --- Existing single-community endpoints (backward compat) ---
router.get('/community', (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=?').get(req.user.communityId);
  res.json(c);
});

router.put('/community', authorize('Administrator'), (req, res) => {
  const { name, address, contact_phone, contact_email, logo_url } = req.body;
  db.prepare(`UPDATE communities SET name=?, address=?, contact_phone=?, contact_email=?, logo_url=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, address, contact_phone, contact_email, logo_url, req.user.communityId);
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'UPDATE', entityType: 'community', entityId: req.user.communityId, module: 'community', actionType: 'EDIT', ip: req.ip });
  res.json({ ok: true });
});

// --- New multi-community endpoints (Enhancement 14) ---

// List all communities (admin only)
router.get('/communities', authorize('Administrator'), (req, res) => {
  const rows = db.prepare('SELECT * FROM communities WHERE is_deleted=0 ORDER BY name').all();
  res.json(rows);
});

// View single community
router.get('/communities/:id', authorize('Administrator'), (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? AND is_deleted=0').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Community not found' });
  res.json(c);
});

// Edit community
router.put('/communities/:id', authorize('Administrator'), (req, res) => {
  const old = db.prepare('SELECT * FROM communities WHERE id=? AND is_deleted=0').get(req.params.id);
  if (!old) return res.status(404).json({ error: 'Community not found' });

  const { name, address, contact_phone, contact_email, mobile_number, logo_url, is_active } = req.body;

  // Validation
  const emailErr = validateEmail(contact_email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const mobileErr = validateMobile(mobile_number);
  if (mobileErr) return res.status(400).json({ error: mobileErr });
  const phoneErr = validateMobile(contact_phone);
  if (phoneErr) return res.status(400).json({ error: 'Invalid contact phone format' });

  db.prepare(`UPDATE communities SET name=?, address=?, contact_phone=?, contact_email=?, mobile_number=?, logo_url=?, is_active=?, updated_at=datetime('now') WHERE id=?`)
    .run(name, address, contact_phone || null, contact_email || null, mobile_number || null, logo_url || null, is_active ? 1 : 0, req.params.id);

  const updated = db.prepare('SELECT * FROM communities WHERE id=?').get(req.params.id);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'UPDATE', entityType: 'community', entityId: req.params.id,
    module: 'community', actionType: 'EDIT',
    oldValues: { name: old.name, address: old.address, contact_phone: old.contact_phone, contact_email: old.contact_email, mobile_number: old.mobile_number, logo_url: old.logo_url, is_active: old.is_active },
    newValues: { name, address, contact_phone, contact_email, mobile_number, logo_url, is_active: is_active ? 1 : 0 },
    ip: req.ip
  });

  res.json(updated);
});

// Delete community (with dependency check)
router.delete('/communities/:id', authorize('Administrator'), (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? AND is_deleted=0').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Community not found' });

  // Check dependencies
  const blockCount = db.prepare('SELECT COUNT(*) as c FROM blocks WHERE community_id=? AND is_deleted=0').get(req.params.id).c;
  const flatCount = db.prepare('SELECT COUNT(*) as c FROM flats WHERE community_id=? AND is_deleted=0').get(req.params.id).c;
  const incidentCount = db.prepare('SELECT COUNT(*) as c FROM incidents WHERE community_id=?').get(req.params.id).c;
  const penaltyCount = db.prepare('SELECT COUNT(*) as c FROM penalties WHERE flat_id IN (SELECT id FROM flats WHERE community_id=?)').get(req.params.id).c;

  if (blockCount > 0 || flatCount > 0 || incidentCount > 0 || penaltyCount > 0) {
    return res.status(409).json({
      error: 'Community cannot be deleted because dependent records exist.',
      dependencies: { blocks: blockCount, flats: flatCount, incidents: incidentCount, penalties: penaltyCount },
      canDeactivate: true
    });
  }

  // Physical delete — no dependencies
  db.prepare('DELETE FROM communities WHERE id=?').run(req.params.id);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'DELETE', entityType: 'community', entityId: req.params.id,
    module: 'community', actionType: 'DELETE',
    oldValues: { name: c.name, address: c.address },
    ip: req.ip
  });

  res.json({ ok: true, message: 'Community deleted successfully' });
});

// Deactivate community
router.post('/communities/:id/deactivate', authorize('Administrator'), (req, res) => {
  const c = db.prepare('SELECT * FROM communities WHERE id=? AND is_deleted=0').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Community not found' });

  db.prepare(`UPDATE communities SET is_active=0, updated_at=datetime('now') WHERE id=?`).run(req.params.id);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'DEACTIVATE', entityType: 'community', entityId: req.params.id,
    module: 'community', actionType: 'DEACTIVATE',
    oldValues: { is_active: c.is_active },
    newValues: { is_active: 0 },
    ip: req.ip
  });

  res.json({ ok: true, message: 'Community deactivated' });
});

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/blocks', (req, res) => {
  const rows = db.prepare('SELECT * FROM blocks WHERE community_id=? AND is_deleted=0 ORDER BY name').all(req.user.communityId);
  res.json(rows);
});

router.post('/blocks', authorize('Administrator'), (req, res) => {
  const { name, ward, street } = req.body;
  if (!name) return res.status(400).json({ error: 'Block name is required' });
  try {
    const info = db.prepare('INSERT INTO blocks (community_id, name, ward, street) VALUES (?, ?, ?, ?)')
      .run(req.user.communityId, name, ward || null, street || null);
    writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'CREATE', entityType: 'block', entityId: info.lastInsertRowid, module: 'block', actionType: 'CREATE', ip: req.ip });
    res.status(201).json(db.prepare('SELECT * FROM blocks WHERE id=?').get(info.lastInsertRowid));
  } catch (e) {
    res.status(400).json({ error: 'A block with this name already exists' });
  }
});

router.put('/blocks/:id', authorize('Administrator'), (req, res) => {
  const { name, ward, street, is_active } = req.body;
  db.prepare('UPDATE blocks SET name=?, ward=?, street=?, is_active=? WHERE id=? AND community_id=?')
    .run(name, ward, street, is_active ? 1 : 0, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'UPDATE', entityType: 'block', entityId: req.params.id, module: 'block', actionType: 'EDIT', ip: req.ip });
  res.json(db.prepare('SELECT * FROM blocks WHERE id=?').get(req.params.id));
});

// ══════════════════════════════════════════════════════════════════════════════
// FLATS (Enhancements 15 & 16)
// ══════════════════════════════════════════════════════════════════════════════

// List flats — optimized query, exclude soft-deleted
router.get('/flats', (req, res) => {
  const { block_id, search } = req.query;
  let q = `SELECT f.*, b.name as block_name FROM flats f JOIN blocks b ON b.id=f.block_id WHERE f.community_id=? AND f.is_deleted=0`;
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
      userId: req.user.id, ...auditCtx(req), action: 'REVEAL_PII', entityType: 'flat', entityId: flat.id,
      module: 'flat', details: { reason: req.query.reason || null, fields: ['mobile_number', 'email'] }, ip: req.ip
    });
    return res.json(flat); // real values, unmasked
  }
  res.json(maskRow(flat));
});

router.post('/flats', authorize('Administrator'), (req, res) => {
  const { block_id, floor, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status } = req.body;
  if (!block_id || !flat_number) return res.status(400).json({ error: 'Block and flat number are required' });

  // Validation (Enhancement 15)
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const mobileErr = validateMobile(mobile_number);
  if (mobileErr) return res.status(400).json({ error: mobileErr });

  // Verify block belongs to this community
  const block = db.prepare('SELECT * FROM blocks WHERE id=? AND community_id=? AND is_deleted=0').get(block_id, req.user.communityId);
  if (!block) return res.status(400).json({ error: 'Invalid block assignment — block not found in this community' });

  try {
    const info = db.prepare(`INSERT INTO flats
      (community_id, block_id, floor, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(req.user.communityId, block_id, floor || null, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status || 'Occupied');
    writeAudit({
      userId: req.user.id, ...auditCtx(req), action: 'CREATE', entityType: 'flat', entityId: info.lastInsertRowid,
      module: 'flat', actionType: 'CREATE',
      newValues: { block_id, floor, flat_number, owner_name, resident_name, occupancy_status },
      ip: req.ip
    });
    res.status(201).json(maskRow(db.prepare('SELECT * FROM flats WHERE id=?').get(info.lastInsertRowid)));
  } catch (e) {
    res.status(400).json({ error: 'This flat number already exists in the selected block' });
  }
});

// Edit flat — Enhanced with validation (Enhancement 15)
router.put('/flats/:id', authorize('Administrator'), (req, res) => {
  const old = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=?').get(req.params.id, req.user.communityId);
  if (!old) return res.status(404).json({ error: 'Flat not found' });

  const { block_id, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status, is_active, floor } = req.body;

  // Validation (Enhancement 15)
  const emailErr = validateEmail(email);
  if (emailErr) return res.status(400).json({ error: emailErr });
  const mobileErr = validateMobile(mobile_number);
  if (mobileErr) return res.status(400).json({ error: mobileErr });

  // Validate block assignment if block_id is provided and changed
  const effectiveBlockId = block_id || old.block_id;
  if (block_id && Number(block_id) !== old.block_id) {
    const block = db.prepare('SELECT * FROM blocks WHERE id=? AND community_id=? AND is_deleted=0').get(block_id, req.user.communityId);
    if (!block) return res.status(400).json({ error: 'Invalid block assignment — block not found in this community' });
  }

  // Duplicate flat number check
  const effectiveFlatNumber = flat_number || old.flat_number;
  const dup = db.prepare('SELECT id FROM flats WHERE block_id=? AND flat_number=? AND id!=? AND is_deleted=0').get(effectiveBlockId, effectiveFlatNumber, req.params.id);
  if (dup) return res.status(400).json({ error: `Flat number ${effectiveFlatNumber} already exists in this block` });

  db.prepare(`UPDATE flats SET block_id=?, flat_number=?, owner_name=?, resident_name=?, mobile_number=?, email=?, occupancy_status=?, is_active=?, floor=?, updated_at=datetime('now')
    WHERE id=? AND community_id=?`)
    .run(effectiveBlockId, effectiveFlatNumber, owner_name, resident_name, mobile_number, email, occupancy_status, is_active ? 1 : 0, floor || null, req.params.id, req.user.communityId);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'UPDATE', entityType: 'flat', entityId: req.params.id,
    module: 'flat', actionType: 'EDIT',
    oldValues: { block_id: old.block_id, flat_number: old.flat_number, owner_name: old.owner_name, resident_name: old.resident_name, occupancy_status: old.occupancy_status, is_active: old.is_active, floor: old.floor },
    newValues: { block_id: effectiveBlockId, flat_number: effectiveFlatNumber, owner_name, resident_name, occupancy_status, is_active: is_active ? 1 : 0, floor },
    ip: req.ip
  });

  res.json(maskRow(db.prepare('SELECT * FROM flats WHERE id=?').get(req.params.id)));
});

// Delete flat — with dependency check (Enhancement 16)
router.delete('/flats/:id', authorize('Administrator'), (req, res) => {
  const flat = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=? AND is_deleted=0').get(req.params.id, req.user.communityId);
  if (!flat) return res.status(404).json({ error: 'Flat not found' });

  // Check dependencies
  const incidentCount = db.prepare('SELECT COUNT(*) as c FROM incidents WHERE flat_id=?').get(req.params.id).c;
  const warningCount = db.prepare('SELECT COUNT(*) as c FROM warnings WHERE flat_id=?').get(req.params.id).c;
  const penaltyCount = db.prepare('SELECT COUNT(*) as c FROM penalties WHERE flat_id=?').get(req.params.id).c;
  const commCount = db.prepare('SELECT COUNT(*) as c FROM communication_log WHERE flat_id=?').get(req.params.id).c;

  if (incidentCount > 0 || warningCount > 0 || penaltyCount > 0 || commCount > 0) {
    return res.status(409).json({
      error: 'This flat contains transaction history and cannot be deleted.',
      dependencies: { incidents: incidentCount, warnings: warningCount, penalties: penaltyCount, communications: commCount },
      canDeactivate: true
    });
  }

  // Physical delete — no dependencies
  db.prepare('DELETE FROM flats WHERE id=?').run(req.params.id);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'DELETE', entityType: 'flat', entityId: req.params.id,
    module: 'flat', actionType: 'DELETE',
    oldValues: { flat_number: flat.flat_number, block_id: flat.block_id, resident_name: flat.resident_name },
    ip: req.ip
  });

  res.json({ ok: true, message: `Flat ${flat.flat_number} deleted successfully` });
});

// Deactivate flat (Enhancement 16)
router.post('/flats/:id/deactivate', authorize('Administrator'), (req, res) => {
  const flat = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=? AND is_deleted=0').get(req.params.id, req.user.communityId);
  if (!flat) return res.status(404).json({ error: 'Flat not found' });

  db.prepare(`UPDATE flats SET is_active=0, updated_at=datetime('now') WHERE id=?`).run(req.params.id);

  writeAudit({
    userId: req.user.id, ...auditCtx(req),
    action: 'DEACTIVATE', entityType: 'flat', entityId: req.params.id,
    module: 'flat', actionType: 'DEACTIVATE',
    oldValues: { is_active: flat.is_active },
    newValues: { is_active: 0 },
    ip: req.ip
  });

  res.json({ ok: true, message: `Flat ${flat.flat_number} deactivated` });
});

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

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
    writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'CREATE', entityType: 'user', entityId: info.lastInsertRowid, module: 'user', actionType: 'CREATE', ip: req.ip });
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
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'UPDATE', entityType: 'user', entityId: req.params.id, module: 'user', actionType: 'EDIT', ip: req.ip });
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// VIOLATION CATEGORIES
// ══════════════════════════════════════════════════════════════════════════════

router.get('/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM violation_categories WHERE community_id=? ORDER BY name').all(req.user.communityId));
});

router.post('/categories', authorize('Administrator'), (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });
  const info = db.prepare('INSERT INTO violation_categories (community_id, name, description) VALUES (?, ?, ?)')
    .run(req.user.communityId, name, description || null);
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'CREATE', entityType: 'violation_category', entityId: info.lastInsertRowid, module: 'category', actionType: 'CREATE', ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM violation_categories WHERE id=?').get(info.lastInsertRowid));
});

router.put('/categories/:id', authorize('Administrator'), (req, res) => {
  const { name, description, is_active } = req.body;
  db.prepare('UPDATE violation_categories SET name=?, description=?, is_active=? WHERE id=? AND community_id=?')
    .run(name, description, is_active ? 1 : 0, req.params.id, req.user.communityId);
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'UPDATE', entityType: 'violation_category', entityId: req.params.id, module: 'category', actionType: 'EDIT', ip: req.ip });
  res.json(db.prepare('SELECT * FROM violation_categories WHERE id=?').get(req.params.id));
});

// ══════════════════════════════════════════════════════════════════════════════
// PENALTY RULES
// ══════════════════════════════════════════════════════════════════════════════

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
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'CREATE', entityType: 'penalty_rule', entityId: info.lastInsertRowid, module: 'penalty_rule', actionType: 'CREATE', ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM penalty_rules WHERE id=?').get(info.lastInsertRowid));
});

router.put('/penalty-rules/:id', authorize('Administrator'), (req, res) => {
  const { warnings_before_penalty, penalty_amount, effective_date, is_active } = req.body;
  db.prepare(`UPDATE penalty_rules SET warnings_before_penalty=?, penalty_amount=?, effective_date=?, is_active=? WHERE id=?`)
    .run(warnings_before_penalty, penalty_amount, effective_date, is_active ? 1 : 0, req.params.id);
  writeAudit({ userId: req.user.id, ...auditCtx(req), action: 'UPDATE', entityType: 'penalty_rule', entityId: req.params.id, module: 'penalty_rule', actionType: 'EDIT', ip: req.ip });
  res.json(db.prepare('SELECT * FROM penalty_rules WHERE id=?').get(req.params.id));
});

export default router;
