import express from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { db } from '../db/index.js';
import { authenticate, authorize, writeAudit } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/residents/template', authorize('Administrator'), (req, res) => {
  const csv = 'Block,FlatNumber,OwnerName,ResidentName,MobileNumber,Email,OccupancyStatus\n' +
    'Block A,101,John Doe,John Doe,+91-9000000000,john@example.com,Occupied\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="resident_upload_template.csv"');
  res.send(csv);
});

router.post('/residents', authorize('Administrator'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV file is required (field name: file)' });

  let records;
  try {
    records = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse CSV file: ' + e.message });
  }

  const blocks = db.prepare('SELECT * FROM blocks WHERE community_id=?').all(req.user.communityId);
  const blockByName = Object.fromEntries(blocks.map(b => [b.name.toLowerCase(), b]));

  const results = { successful: 0, rejected: 0, details: [] };
  const insertFlat = db.prepare(`INSERT INTO flats
    (community_id, block_id, flat_number, owner_name, resident_name, mobile_number, email, occupancy_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const findExisting = db.prepare('SELECT id FROM flats WHERE block_id=? AND flat_number=?');

  const tx = db.transaction((rows) => {
    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // account for header
      const block = row.Block ? blockByName[row.Block.toLowerCase()] : null;
      const flatNumber = row.FlatNumber?.trim();
      const mobile = row.MobileNumber?.trim();
      const email = row.Email?.trim();

      if (!block) {
        results.rejected++;
        results.details.push({ row: rowNum, flatNumber, reason: `Invalid block: "${row.Block}"` });
        return;
      }
      if (!flatNumber) {
        results.rejected++;
        results.details.push({ row: rowNum, flatNumber, reason: 'Missing flat number' });
        return;
      }
      if (!mobile) {
        results.rejected++;
        results.details.push({ row: rowNum, flatNumber, reason: 'Missing mobile number' });
        return;
      }
      if (!email) {
        results.rejected++;
        results.details.push({ row: rowNum, flatNumber, reason: 'Missing email' });
        return;
      }
      if (findExisting.get(block.id, flatNumber)) {
        results.rejected++;
        results.details.push({ row: rowNum, flatNumber, reason: 'Duplicate flat (already exists)' });
        return;
      }
      insertFlat.run(req.user.communityId, block.id, flatNumber, row.OwnerName || null,
        row.ResidentName || null, mobile, email, row.OccupancyStatus || 'Occupied');
      results.successful++;
    });
  });
  tx(records);

  writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'flat_bulk_upload', details: results, ip: req.ip });
  res.json(results);
});

export default router;
