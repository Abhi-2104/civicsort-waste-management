import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import { Readable } from 'stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'db', 'waste.db');
const BACKUP_FILENAME = 'waste.db';
const DB_FOLDER_NAME = 'CivicSort_Database';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function driveConfigured() {
  return (
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY &&
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY !== 'YOUR_SERVICE_ACCOUNT_JSON_HERE' &&
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID &&
    process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID !== 'YOUR_ROOT_FOLDER_ID_HERE'
  );
}

async function getDriveClient() {
  const keyJson = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: keyJson,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return google.drive({ version: 'v3', auth });
}

// In-memory cache so we don't re-query Drive folder IDs on every sync
let dbFolderId = null;
let backupFileId = null;

async function getDbFolder(drive) {
  if (dbFolderId) return dbFolderId;
  const rootId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const res = await drive.files.list({
    q: `name='${DB_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) {
    dbFolderId = res.data.files[0].id;
  } else {
    const folder = await drive.files.create({
      requestBody: { name: DB_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder', parents: [rootId] },
      fields: 'id',
    });
    dbFolderId = folder.data.id;
  }
  return dbFolderId;
}

async function getBackupFileId(drive, folderId) {
  if (backupFileId) return backupFileId;
  const res = await drive.files.list({
    q: `name='${BACKUP_FILENAME}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) {
    backupFileId = res.data.files[0].id;
  }
  return backupFileId;
}

// ── Backup ────────────────────────────────────────────────────────────────────

export async function backupDB() {
  if (!fs.existsSync(DB_PATH)) return;
  try {
    const drive = await getDriveClient();
    const folderId = await getDbFolder(drive);
    const existingId = await getBackupFileId(drive, folderId);
    const dbBuffer = fs.readFileSync(DB_PATH);

    if (existingId) {
      // Overwrite the existing backup file in place
      await drive.files.update({
        fileId: existingId,
        media: { mimeType: 'application/x-sqlite3', body: Readable.from(dbBuffer) },
      });
    } else {
      // First-ever backup — create the file
      const created = await drive.files.create({
        requestBody: {
          name: BACKUP_FILENAME,
          mimeType: 'application/x-sqlite3',
          parents: [folderId],
        },
        media: { mimeType: 'application/x-sqlite3', body: Readable.from(dbBuffer) },
        fields: 'id',
      });
      backupFileId = created.data.id;
    }
    console.log(`[DriveSync] ✓ Database backed up to Drive (${(dbBuffer.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    console.error('[DriveSync] ✗ Backup failed:', e.message);
  }
}

// ── Restore (called on server startup) ───────────────────────────────────────

export async function restoreDB() {
  if (fs.existsSync(DB_PATH)) {
    console.log('[DriveSync] Local database exists — no restore needed.');
    return false;
  }
  console.log('[DriveSync] No local database found — attempting restore from Drive...');
  try {
    const drive = await getDriveClient();
    const folderId = await getDbFolder(drive);
    const existingId = await getBackupFileId(drive, folderId);

    if (!existingId) {
      console.log('[DriveSync] No backup on Drive yet — starting fresh.');
      return false;
    }

    const res = await drive.files.get(
      { fileId: existingId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, Buffer.from(res.data));
    console.log('[DriveSync] ✓ Database restored from Drive backup.');
    return true;
  } catch (e) {
    console.error('[DriveSync] ✗ Restore failed:', e.message);
    return false;
  }
}

// ── Smart Sync Watcher ────────────────────────────────────────────────────────
// • Polls every 30 seconds
// • Uploads immediately if the DB file was modified since last backup
// • Also force-uploads every 5 minutes as a safety heartbeat

export function startSyncWatcher() {
  if (!driveConfigured()) {
    console.log('[DriveSync] Drive not configured — sync disabled (running in local mode).');
    return;
  }

  const POLL_INTERVAL_MS   = 30 * 1000;       // check every 30 seconds
  const FORCE_INTERVAL_MS  = 5 * 60 * 1000;   // force backup every 5 minutes

  let lastSyncedMtime   = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).mtimeMs : null;
  let lastForcedBackup  = Date.now();

  // Do an immediate baseline backup when the watcher starts
  backupDB();

  setInterval(async () => {
    if (!fs.existsSync(DB_PATH)) return;

    const currentMtime = fs.statSync(DB_PATH).mtimeMs;
    const dbChanged    = currentMtime !== lastSyncedMtime;
    const forceDue     = (Date.now() - lastForcedBackup) >= FORCE_INTERVAL_MS;

    if (dbChanged || forceDue) {
      await backupDB();
      lastSyncedMtime  = currentMtime;
      lastForcedBackup = Date.now();
    }
  }, POLL_INTERVAL_MS);

  console.log('[DriveSync] Smart sync watcher started — polls every 30s, uploads on change + every 5min.');
}
