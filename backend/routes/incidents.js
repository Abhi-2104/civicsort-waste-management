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
import { driveConfigured } from '../services/driveSync.js';

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

async function uploadToCentralDrive(buffer, { incidentNumber, blockName, flatNumber, incidentDate, seq }) {
  const drive = getDriveClient();
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  // Build Year → Month → Day folder path
  const date = incidentDate ? new Date(incidentDate) : new Date();
  const year  = date.getFullYear().toString();
  const month = MONTHS[date.getMonth()];
  const day   = date.getDate().toString();

  const yearId  = await getOrCreateFolder(drive, year,  rootId);
  const monthId = await getOrCreateFolder(drive, month, yearId);
  const dayId   = await getOrCreateFolder(drive, day,   monthId);

  // Descriptive filename: INC-2026-000123_BlockA_Flat101_14-30-22_1.jpg
  const safeStr = (s) => (s || '').replace(/[^a-zA-Z0-9]/g, '');
  const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '-');
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
router.get('/', (req, res) => {
  const { status, block_id, category_id, from, to, maker_id, flat_id, search } = req.query;
  let q = `
    SELECT i.*, f.flat_number, b.name as block_name, vc.name as category_name,
           m.name as maker_name, s.name as supervisor_name, fl_res.resident_name
    FROM incidents i
    JOIN flats f ON f.id = i.flat_id
    LEFT JOIN flats fl_res ON fl_res.id = i.flat_id
    JOIN blocks b ON b.id = i.block_id
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
  if (from) { q += ' AND i.incident_date >= ?'; params.push(from); }
  if (to) { q += ' AND i.incident_date <= ?'; params.push(to); }
  if (search) {
    q += ' AND (f.flat_number LIKE ? OR i.incident_number LIKE ? OR fl_res.resident_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  q += ' ORDER BY i.created_at DESC LIMIT 500';
  res.json(db.prepare(q).all(...params));
});

router.get('/:id', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, f.flat_number, f.resident_name, f.mobile_number, f.email, b.name as block_name,
           vc.name as category_name, m.name as maker_name, s.name as supervisor_name
    FROM incidents i
    JOIN flats f ON f.id = i.flat_id
    JOIN blocks b ON b.id = i.block_id
    JOIN violation_categories vc ON vc.id = i.category_id
    JOIN users m ON m.id = i.maker_id
    LEFT JOIN users s ON s.id = i.supervisor_id
    WHERE i.id = ? AND i.community_id = ?
  `).get(req.params.id, req.user.communityId);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const photos = db.prepare('SELECT * FROM incident_photos WHERE incident_id=?').all(req.params.id);
  res.json({ ...incident, photos });
});

// ---------- Capture incident ----------
router.post('/', authorize('Administrator', 'Maker'), upload.array('photos', 8), async (req, res) => {
  const { flat_id, category_id, incident_date, incident_time, gps_lat, gps_lng, remarks } = req.body;
  if (!flat_id || !category_id || !incident_date) {
    return res.status(400).json({ error: 'Flat, category, and incident date are required' });
  }
  const flat = db.prepare('SELECT * FROM flats WHERE id=? AND community_id=?').get(flat_id, req.user.communityId);
  if (!flat) return res.status(400).json({ error: 'Invalid flat' });

  const incidentNumber = nextSequence('INC', 'incidents', 'incident_number');

  const info = db.prepare(`INSERT INTO incidents
    (incident_number, community_id, block_id, flat_id, category_id, incident_date, incident_time,
     gps_lat, gps_lng, remarks, maker_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Approval')`)
    .run(incidentNumber, req.user.communityId, flat.block_id, flat_id, category_id, incident_date,
      incident_time || null, gps_lat || null, gps_lng || null, remarks || null, req.user.id);

  const incidentId = info.lastInsertRowid;

  // ---- Photo handling ----
  // 1. Compress with sharp (~100 KB per photo)
  // 2. Upload to centralized Google Drive (Year/Month/Day/filename) via Service Account
  // 3. If Drive is not configured, fall back to local disk (for local dev / demo)
  const files = req.files || [];
  // Fetch block name for the filename
  const block = db.prepare('SELECT name FROM blocks WHERE id=?').get(flat.block_id);

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
          blockName:  block?.name || 'Unknown',
          flatNumber: flat.flat_number,
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

  let resolution = null;
  if (decision === 'Approved') {
    resolution = applyWarningPenaltyEngine(incident);
  }

  db.prepare(`UPDATE incidents SET status=?, supervisor_id=?, supervisor_remarks=?, decided_at=datetime('now'),
    resolution=?, updated_at=datetime('now') WHERE id=?`)
    .run(decision, req.user.id, remarks || null, resolution, incident.id);

  writeAudit({
    userId: req.user.id, action: decision.toUpperCase(), entityType: 'incident', entityId: incident.id,
    details: { remarks, resolution }, ip: req.ip
  });

  if (decision === 'Approved') {
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
