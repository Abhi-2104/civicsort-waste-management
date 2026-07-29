import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'waste.db');

const isNew = !fs.existsSync(DB_PATH);
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
db.exec(schema);

function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

// Backward-compatible migration: any database created before the multi-level
// incident enhancement gets upgraded in place. Existing incident rows have no
// incident_level column and, by definition, only ever captured Flat-level
// incidents, so they are migrated as incident_level='Flat' with their
// existing block_id/flat_id preserved untouched. No data is lost or altered.
function migrate() {
  if (!columnExists('flats', 'floor')) {
    db.exec(`ALTER TABLE flats ADD COLUMN floor TEXT;`);
  }

  if (!columnExists('incidents', 'incident_level')) {
    const tx = db.transaction(() => {
      db.exec(`ALTER TABLE incidents RENAME TO incidents_legacy;`);
      db.exec(`
        CREATE TABLE incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_number TEXT NOT NULL UNIQUE,
          community_id INTEGER NOT NULL REFERENCES communities(id),
          incident_level TEXT NOT NULL DEFAULT 'Flat',
          block_id INTEGER REFERENCES blocks(id),
          floor TEXT,
          flat_id INTEGER REFERENCES flats(id),
          category_id INTEGER NOT NULL REFERENCES violation_categories(id),
          incident_date TEXT NOT NULL,
          incident_time TEXT,
          gps_lat REAL,
          gps_lng REAL,
          remarks TEXT,
          maker_id INTEGER NOT NULL REFERENCES users(id),
          status TEXT NOT NULL DEFAULT 'Pending Approval',
          supervisor_id INTEGER REFERENCES users(id),
          supervisor_remarks TEXT,
          decided_at TEXT,
          resolution TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `);
      db.exec(`
        INSERT INTO incidents (id, incident_number, community_id, incident_level, block_id, floor, flat_id,
          category_id, incident_date, incident_time, gps_lat, gps_lng, remarks, maker_id, status,
          supervisor_id, supervisor_remarks, decided_at, resolution, created_at, updated_at)
        SELECT id, incident_number, community_id, 'Flat', block_id, NULL, flat_id,
          category_id, incident_date, incident_time, gps_lat, gps_lng, remarks, maker_id, status,
          supervisor_id, supervisor_remarks, decided_at, resolution, created_at, updated_at
        FROM incidents_legacy;
      `);
      db.exec(`DROP TABLE incidents_legacy;`);
      // Recreate indexes lost when the old table was dropped
      db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_flat ON incidents(flat_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category_id);`);
      db.exec(`CREATE INDEX IF NOT EXISTS idx_incidents_level ON incidents(incident_level);`);
    });
    tx();
    console.log('[migrate] Upgraded incidents table for multi-level incident capture (existing rows preserved as Flat-level).');
  }
}

migrate();

// V2 migration: soft-delete framework + enhanced audit logging (Enhancements 17 & 18)
function migrate_v2() {
  // --- Soft-delete columns on master tables ---
  const softDeleteTables = ['communities', 'blocks', 'flats'];
  for (const table of softDeleteTables) {
    if (!columnExists(table, 'is_deleted')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0;`);
    }
    if (!columnExists(table, 'deleted_by')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_by INTEGER;`);
    }
    if (!columnExists(table, 'deleted_at')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT;`);
    }
  }

  // Mobile number on communities (Enhancement 14)
  if (!columnExists('communities', 'mobile_number')) {
    db.exec(`ALTER TABLE communities ADD COLUMN mobile_number TEXT;`);
  }

  // --- Enhanced audit_log columns (Enhancement 18) ---
  if (!columnExists('audit_log', 'user_name')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN user_name TEXT;`);
  }
  if (!columnExists('audit_log', 'user_role')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN user_role TEXT;`);
  }
  if (!columnExists('audit_log', 'module')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN module TEXT;`);
  }
  if (!columnExists('audit_log', 'old_values')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN old_values TEXT;`);
  }
  if (!columnExists('audit_log', 'new_values')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN new_values TEXT;`);
  }
  if (!columnExists('audit_log', 'action_type')) {
    db.exec(`ALTER TABLE audit_log ADD COLUMN action_type TEXT;`);
  }

  console.log('[migrate_v2] Soft-delete framework and enhanced audit logging ready.');
}

migrate_v2();

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_incidents_flat ON incidents(flat_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_level ON incidents(incident_level);
  CREATE INDEX IF NOT EXISTS idx_flats_block ON flats(block_id);
  CREATE INDEX IF NOT EXISTS idx_penalties_flat ON penalties(flat_id);
  CREATE INDEX IF NOT EXISTS idx_communities_active ON communities(is_active, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_blocks_active ON blocks(is_active, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_flats_active ON flats(is_active, is_deleted);
  CREATE INDEX IF NOT EXISTS idx_flats_community ON flats(community_id);
  CREATE INDEX IF NOT EXISTS idx_warnings_flat ON warnings(flat_id);
  CREATE INDEX IF NOT EXISTS idx_comm_log_flat ON communication_log(flat_id);
`);

export function nextSequence(prefix, table, column) {
  // Generates a human-friendly unique number like INC-2026-000123
  const year = new Date().getFullYear();
  const row = db.prepare(
    `SELECT COUNT(*) as c FROM ${table} WHERE ${column} LIKE ?`
  ).get(`${prefix}-${year}-%`);
  const seq = String(row.c + 1).padStart(6, '0');
  return `${prefix}-${year}-${seq}`;
}

export { isNew };
