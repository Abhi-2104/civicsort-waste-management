import express from 'express';
import { db } from '../db/index.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

router.get('/summary', (req, res) => {
  const communityId = req.user.communityId;
  const counts = db.prepare(`
    SELECT
      COUNT(*) as total_incidents,
      SUM(CASE WHEN status='Pending Approval' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status='Approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='Rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status='Condoned' THEN 1 ELSE 0 END) as condoned,
      SUM(CASE WHEN resolution='Warning' THEN 1 ELSE 0 END) as warnings,
      SUM(CASE WHEN resolution='Penalty' THEN 1 ELSE 0 END) as penalties
    FROM incidents WHERE community_id=?
  `).get(communityId);

  const penaltyStats = db.prepare(`
    SELECT
      COALESCE(SUM(penalty_amount),0) as total_amount,
      COALESCE(SUM(CASE WHEN status='Paid' THEN penalty_amount ELSE 0 END),0) as collected,
      COALESCE(SUM(CASE WHEN status='Outstanding' THEN penalty_amount ELSE 0 END),0) as outstanding
    FROM penalties p JOIN flats f ON f.id=p.flat_id WHERE f.community_id=?
  `).get(communityId);

  const blockWise = db.prepare(`
    SELECT b.name as block, COUNT(i.id) as incidents
    FROM blocks b LEFT JOIN incidents i ON i.block_id=b.id
    WHERE b.community_id=? GROUP BY b.id ORDER BY incidents DESC
  `).all(communityId);

  const monthly = db.prepare(`
    SELECT strftime('%Y-%m', incident_date) as month, COUNT(*) as count
    FROM incidents WHERE community_id=? GROUP BY month ORDER BY month DESC LIMIT 12
  `).all(communityId);

  const topBlocks = blockWise.slice(0, 5);

  const topCategories = db.prepare(`
    SELECT vc.name as category, COUNT(*) as count
    FROM incidents i JOIN violation_categories vc ON vc.id=i.category_id
    WHERE i.community_id=? GROUP BY vc.name ORDER BY count DESC LIMIT 5
  `).all(communityId);

  res.json({ counts, penaltyStats, blockWise, monthly, topBlocks, topCategories });
});

// ---------- Global search ----------
router.get('/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json({ flats: [], incidents: [], penalties: [] });
  const communityId = req.user.communityId;
  const like = `%${q}%`;

  const flats = db.prepare(`SELECT id, flat_number, resident_name, mobile_number FROM flats
    WHERE community_id=? AND (flat_number LIKE ? OR resident_name LIKE ? OR mobile_number LIKE ?) LIMIT 10`)
    .all(communityId, like, like, like);

  const incidents = db.prepare(`SELECT id, incident_number, incident_date, status FROM incidents
    WHERE community_id=? AND incident_number LIKE ? LIMIT 10`).all(communityId, like);

  const penalties = db.prepare(`SELECT p.id, p.penalty_number, p.penalty_amount, p.status FROM penalties p
    JOIN flats f ON f.id=p.flat_id WHERE f.community_id=? AND p.penalty_number LIKE ? LIMIT 10`)
    .all(communityId, like);

  res.json({ flats, incidents, penalties });
});

// ---------- Notifications ----------
router.get('/notifications', (req, res) => {
  const communityId = req.user.communityId;
  const pendingApproval = db.prepare(`SELECT COUNT(*) as c FROM incidents WHERE community_id=? AND status='Pending Approval'`)
    .get(communityId).c;
  const unpaidPenalties = db.prepare(`SELECT COUNT(*) as c FROM penalties p JOIN flats f ON f.id=p.flat_id
    WHERE f.community_id=? AND p.status='Outstanding'`).get(communityId).c;
  const notifications = [];
  if (pendingApproval > 0) notifications.push({ type: 'Pending Approval', message: `${pendingApproval} incident(s) awaiting approval`, count: pendingApproval });
  if (unpaidPenalties > 0) notifications.push({ type: 'Unpaid Penalty', message: `${unpaidPenalties} penalty(ies) outstanding`, count: unpaidPenalties });
  res.json(notifications);
});

// ---------- Audit log (read-only, admin only) ----------
router.get('/audit', authorize('Administrator'), (req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.name as user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
    ORDER BY a.created_at DESC LIMIT 300
  `).all();
  res.json(rows);
});

export default router;
