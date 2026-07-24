import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Readable } from 'stream';
import sharp from 'sharp';
import { v4 as uuid } from 'uuid';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { db, nextSequence } from '../db/index.js';
import { authenticate, authorize, writeAudit } from '../middleware/auth.js';
import { sendCommunication } from '../services/communication.js';
import { maskRow } from '../utils/mask.js';
import { driveConfigured } from '../services/driveSync.js';

const INCIDENT_LEVELS = ['Community', 'Block', 'Floor', 'Flat'];

// ---------- Centralized Google Drive upload (OAuth2 Client) ----------
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

// In-memory cache of folder IDs so we don't re-query Drive on every photo.
const folderCache = new Map();

function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function getOrCreateFolder(drive, name, parentId) {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const res = await drive.files.list({
    q: `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  let folderId;
  if (res.data.files.length > 0) {
    folderId = res.data.files[0].id;
  } else {
    const folder = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id',
      supportsAllDrives: true,
    });
    folderId = folder.data.id;
  }
  folderCache.set(cacheKey, folderId);
  return folderId;
}

function getISTDateParts(incidentDate) {
  if (incidentDate) {
    const [y, m, d] = incidentDate.split('-');
    const monthIndex = parseInt(m, 10) - 1;
    return {
      year: y,
      month: MONTHS[monthIndex],
      day: parseInt(d, 10).toString()
    };
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const getValue = type => parts.find(p => p.type === type).value;
  const monthIndex = parseInt(getValue('month'), 10) - 1;

  return {
    year: getValue('year'),
    month: MONTHS[monthIndex],
    day: parseInt(getValue('day'), 10).toString()
  };
}

function getISTTimeStr() {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const getValue = type => parts.find(p => p.type === type).value;
  return `${getValue('hour')}-${getValue('minute')}-${getValue('second')}`;
}

async function uploadToCentralDrive(buffer, { incidentNumber, blockName, flatNumber, incidentDate, seq }) {
  const drive = getDriveClient();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  // Build Year → Month → Day folder path using IST
  const { year, month, day } = getISTDateParts(incidentDate);

  const yearId  = await getOrCreateFolder(drive, year,  rootId);
  const monthId = await getOrCreateFolder(drive, month, yearId);
  const dayId   = await getOrCreateFolder(drive, day,   monthId);

  // Descriptive filename: INC-2026-000123_BlockA_Flat101_14-30-22_1.jpg
  const safeStr = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '');
  const timeStr = getISTTimeStr();
  const filename = `${incidentNumber}_${safeStr(blockName)}_${safeStr(flatNumber)}_${timeStr}_${seq}.jpg`;

  // Upload
  const uploadRes = await drive.files.create({
    requestBody: { name: filename, mimeType: 'image/jpeg', parents: [dayId] },
    media: { mimeType: 'image/jpeg', body: Readable.from(buffer) },
    fields: 'id',
    supportsAllDrives: true,
  });
  const fileId = uploadRes.data.id;

  // Make viewable by anyone with the link
  await drive.permissions.create({
    fileId,
    requestBody: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });

  return {
    fileId,
    thumbUrl: `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`,
    fullUrl:  `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
  };
}


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumbs');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(THUMB_DIR, { recursive: true });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 8 } });

const router = express.Router();
router.use(authenticate);

// ---------- List / filter incidents ----------
// Community-level incidents have no block/flat; Block-level have a block but
// no floor/flat; Floor-level have a block+floor but no flat; Flat-level have
// all three. LEFT JOINs mean the non-applicable columns simply come back null.
router.get('/', (req, res) => {
  const { status, block_id, category_id, from, to, maker_id, flat_id, incident_level, floor, search } = req.query;
  let q = `
    SELECT i.*, f.flat_number, b.name as block_name, vc.name as category_name,
           m.name as maker_name, s.name as supervisor_name, f.resident_name
    FROM incidents i
    LEFT JOIN flats f ON f.id = i.flat_id
    LEFT JOIN blocks b ON b.id = i.block_id
    JOIN violation_categories vc ON vc.id = i.category_id
    JOIN users m ON m.id = i.maker_id
    LEFT JOIN users s ON s.id = i.supervisor_id
    WHERE i.community_id = ?
  `;
  const params = [req.user.communityId];
  if (status) { q += ' AND i.status=?'; params.push(status); }
  if (block_id) { q += ' AND i.block_id=?'; params.push(block_id); }
  if (category_id) { q += ' AND i.category_id=?'; params.push(category_id); }
  if (maker_id) { q += ' AND i.maker_id=?'; params.push(maker_id); }
  if (flat_id) { q += ' AND i.flat_id=?'; params.push(flat_id); }
  if (incident_level) { q += ' AND i.incident_level=?'; params.push(incident_level); }
  if (floor) { q += ' AND i.floor=?'; params.push(floor); }
  if (from) { q += ' AND i.incident_date >= ?'; params.push(from); }
  if (to) { q += ' AND i.incident_date <= ?'; params.push(to); }
  if (search) {
    q += ' AND (f.flat_number LIKE ? OR i.incident_number LIKE ? OR f.resident_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY i.created_at DESC LIMIT 500';
  // resident_name is not PII per the spec (only mobile/email are masked); this list
  // never selects mobile_number/email so there is nothing to mask here.
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, f.flat_number, f.resident_name, f.mobile_number, f.email, b.name as block_name,
           vc.name as category_name, m.name as maker_name, s.name as supervisor_name
    FROM incidents i
    LEFT JOIN flats f ON f.id = i.flat_id
    LEFT JOIN blocks b ON b.id = i.block_id
    JOIN violation_categories vc ON vc.id = i.category_id
    JOIN users m ON m.id = i.maker_id
    LEFT JOIN users s ON s.id = i.supervisor_id
    WHERE i.id = ? AND i.community_id = ?
  `).get(req.params.id, req.user.communityId);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const photos = db.prepare('SELECT * FROM incident_photos WHERE incident_id=?').all(req.params.id);

  const wantsUnmask = (req.query.unmask === 'true' || req.query.unmask === '1') && incident.flat_id;
  if (wantsUnmask) {
    if (req.user.role !== 'Administrator') {
      return res.status(403).json({ error: 'Only administrators may view unmasked contact information' });
    }
    writeAudit({
      userId: req.user.id, action: 'REVEAL_PII', entityType: 'flat', entityId: incident.flat_id,
      details: { via: 'incident_detail', incidentId: incident.id, reason: req.query.reason || null }, ip: req.ip
    });
    return res.json({ ...incident, photos }); // real values, unmasked
  }
  res.json({ ...maskRow(incident), photos });
});

// ---------- Capture incident ----------
// incident_level determines which location fields are mandatory:
//   Community -> none (block/floor/flat all null)
//   Block     -> block_id required
//   Floor     -> block_id + floor required
//   Flat      -> block_id + flat_id required (floor auto-derived from the flat if not supplied)
router.post('/', authorize('Administrator', 'Maker'), upload.array('photos', 8), async (req, res) => {
  const { category_id, incident_date, incident_time, gps_lat, gps_lng, remarks } = req.body;
  const incidentLevel = req.body.incident_level || 'Flat'; // default keeps old clients (pre-enhancement) working unchanged
  let { block_id, floor, flat_id } = req.body;

  if (!INCIDENT_LEVELS.includes(incidentLevel)) {
    return res.status(400).json({ error: 'Incident level must be one of: ' + INCIDENT_LEVELS.join(', ') });
  }
  if (!category_id || !incident_date) {
    return res.status(400).json({ error: 'Violation category and incident date are required' });
  }

  let flat = null;
  if (incidentLevel === 'Community') {
    block_id = null; floor = null; flat_id = null;
  } else if (incidentLevel === 'Block') {
    if (!block_id) return res.status(400).json({ error: 'Block is required for a Block-level incident' });
    floor = null; flat_id = null;
  } else if (incidentLevel === 'Floor') {
    if (!block_id) return res.status(400).json({ error: 'Block is required for a Floor-level incident' });
    if (!floor) return res.status(400).json({ error: 'Floor is required for a Floor-level incident' });
    flat_id = null;
  } else { // Flat
    if (!flat_id) return res.status(400).json({ error: 'Flat is required for a Flat-level incident' });
    flat = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=?').get(flat_id, req.user.communityId);
    if (!flat) return res.status(400).json({ error: 'Invalid flat' });
    block_id = flat.block_id; // block is always derived from the flat, never trusted from the client
    if (!floor) floor = flat.floor || null; // auto-fill from master data when available; not mandatory otherwise
  }

  if (block_id) {
    const block = db.prepare('SELECT * FROM blocks WHERE id=? AND community_id=?').get(block_id, req.user.communityId);
    if (!block) return res.status(400).json({ error: 'Invalid block' });
  }

  const incidentNumber = nextSequence('INC', 'incidents', 'incident_number');

  const info = db.prepare(`INSERT INTO incidents
    (incident_number, community_id, incident_level, block_id, floor, flat_id, category_id, incident_date, incident_time,
     gps_lat, gps_lng, remarks, maker_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Approval')`)
    .run(incidentNumber, req.user.communityId, incidentLevel, block_id || null, floor || null, flat_id || null,
      category_id, incident_date, incident_time || null, gps_lat || null, gps_lng || null, remarks || null, req.user.id);

  const incidentId = info.lastInsertRowid;

  // ---- Photo handling ----
  // 1. Compress with sharp (~100 KB per photo)
  // 2. Upload to centralized Google Drive (Year/Month/Day/filename) via OAuth2
  // 3. If Drive is not configured, fall back to local disk (for local dev / demo)
  const files = req.files || [];
  // Fetch block name for the filename
  const blockRow = block_id ? db.prepare('SELECT name FROM blocks WHERE id=?').get(block_id) : null;

  for (let seq = 0; seq < files.length; seq++) {
    const file = files[seq];
    const base = `${incidentId}-${uuid()}`;
    let filePath, thumbPath;

    // Step 1 — Compress
    let compressedBuffer;
    try {
      compressedBuffer = await sharp(file.buffer)
        .rotate()
        .resize({ width: 1200, withoutEnlargement: true })
        .jpeg({ quality: 72 })
        .toBuffer();
    } catch (e) {
      compressedBuffer = file.buffer;
    }

    // Step 2 — Try centralized Drive upload
    if (driveConfigured()) {
      try {
        const result = await uploadToCentralDrive(compressedBuffer, {
          incidentNumber,
          blockName:  blockRow?.name || 'Unknown',
          flatNumber: flat?.flat_number || 'NA',
          incidentDate: incident_date,
          seq: seq + 1,
        });
        filePath  = result.fullUrl;
        thumbPath = result.thumbUrl;
      } catch (driveErr) {
        console.error(`[Drive] Upload failed for photo ${seq + 1}, falling back to local disk:`, driveErr.message);
      }
    }

    // Step 3 — Fallback: local disk
    if (!filePath) {
      const fullPath = path.join(UPLOAD_DIR, `${base}.jpg`);
      const tPath   = path.join(THUMB_DIR,  `${base}-thumb.jpg`);
      try {
        fs.writeFileSync(fullPath, compressedBuffer);
        const thumbBuf = await sharp(compressedBuffer)
          .resize({ width: 300, withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();
        fs.writeFileSync(tPath, thumbBuf);
      } catch (e) {
        fs.writeFileSync(fullPath, file.buffer);
      }
      filePath  = `/uploads/${base}.jpg`;
      thumbPath = `/uploads/thumbs/${base}-thumb.jpg`;
    }

    db.prepare(`INSERT INTO incident_photos (incident_id, file_path, thumb_path, original_name)
      VALUES (?, ?, ?, ?)`).run(incidentId, filePath, thumbPath, file.originalname);
  }

  writeAudit({ userId: req.user.id, action: 'CREATE', entityType: 'incident', entityId: incidentId, ip: req.ip });
  res.status(201).json(db.prepare('SELECT * FROM incidents WHERE id=?').get(incidentId));
});

// ---------- Workflow: Approve / Reject / Condone ----------
router.post('/:id/decision', authorize('Administrator', 'Supervisor'), async (req, res) => {
  const { decision, remarks } = req.body; // decision: Approved | Rejected | Condoned
  if (!['Approved', 'Rejected', 'Condoned'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be Approved, Rejected, or Condoned' });
  }
  const incident = db.prepare('SELECT * FROM incidents WHERE id=? AND community_id=?').get(req.params.id, req.user.communityId);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (incident.status !== 'Pending Approval') {
    return res.status(400).json({ error: `Incident already decided (status: ${incident.status})` });
  }

  // Warnings, penalties, and resident notification are only meaningful for
  // Flat-level incidents, which are tied to one resident. Community/Block/Floor
  // level incidents still go through the same approve/reject/condone workflow,
  // but approving one does not generate a warning or penalty (per spec).
  let resolution = null;
  if (decision === 'Approved' && incident.incident_level === 'Flat') {
    resolution = applyWarningPenaltyEngine(incident);
  }

  db.prepare(`UPDATE incidents SET status=?, supervisor_id=?, supervisor_remarks=?, decided_at=datetime('now'),
    resolution=?, updated_at=datetime('now') WHERE id=?`)
    .run(decision, req.user.id, remarks || null, resolution, incident.id);

  writeAudit({
    userId: req.user.id, action: decision.toUpperCase(), entityType: 'incident', entityId: incident.id,
    details: { remarks, resolution, incidentLevel: incident.incident_level }, ip: req.ip
  });

  if (decision === 'Approved' && incident.incident_level === 'Flat') {
    await notifyResident(incident, resolution);
  }

  res.json(db.prepare('SELECT * FROM incidents WHERE id=?').get(incident.id));
});

// Automatic warning/penalty engine: called only for approved incidents
function applyWarningPenaltyEngine(incident) {
  const rule = db.prepare(`SELECT * FROM penalty_rules WHERE category_id=? AND is_active=1
    ORDER BY effective_date DESC LIMIT 1`).get(incident.category_id);
  const warningsAllowed = rule ? rule.warnings_before_penalty : 1;

  // Count prior APPROVED incidents for same flat + category that resulted in a Warning
  const priorWarnings = db.prepare(`SELECT COUNT(*) as c FROM warnings WHERE flat_id=? AND category_id=?`)
    .get(incident.flat_id, incident.category_id).c;

  if (priorWarnings < warningsAllowed) {
    const warningNumber = priorWarnings + 1;
    db.prepare(`INSERT INTO warnings (incident_id, flat_id, category_id, warning_number) VALUES (?, ?, ?, ?)`)
      .run(incident.id, incident.flat_id, incident.category_id, warningNumber);
    return 'Warning';
  } else {
    const penaltyNumber = nextSequence('PEN', 'penalties', 'penalty_number');
    const amount = rule ? rule.penalty_amount : 0;
    db.prepare(`INSERT INTO penalties (penalty_number, incident_id, flat_id, category_id, penalty_amount, penalty_date, status)
      VALUES (?, ?, ?, ?, ?, date('now'), 'Outstanding')`)
      .run(penaltyNumber, incident.id, incident.flat_id, incident.category_id, amount);
    return 'Penalty';
  }
}

async function notifyResident(incident, resolution) {
  const flat = db.prepare('SELECT * FROM flats WHERE id=?').get(incident.flat_id);
  const category = db.prepare('SELECT * FROM violation_categories WHERE id=?').get(incident.category_id);
  let penalty = null, warningNumber = null;
  if (resolution === 'Penalty') {
    penalty = db.prepare('SELECT * FROM penalties WHERE incident_id=?').get(incident.id);
  } else {
    const w = db.prepare('SELECT * FROM warnings WHERE incident_id=?').get(incident.id);
    warningNumber = w ? w.warning_number : null;
  }
  await sendCommunication({
    communityId: incident.community_id,
    incidentId: incident.id,
    flat,
    eventType: resolution,
    categoryName: category.name,
    date: incident.incident_date,
    remarks: incident.supervisor_remarks,
    penalty,
    warningNumber,
  });
}

// ---------- Photo serving is handled statically in server.js ----------

export default router;
