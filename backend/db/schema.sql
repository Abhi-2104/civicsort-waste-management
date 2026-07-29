-- Community Waste Disposal Monitoring & Penalty Management System
-- Normalized schema (SQLite dialect, portable to PostgreSQL with minor type changes)

CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  logo_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  name TEXT NOT NULL,          -- Block/Tower name
  ward TEXT,
  street TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(community_id, name)
);

CREATE TABLE IF NOT EXISTS flats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  block_id INTEGER NOT NULL REFERENCES blocks(id),
  floor TEXT,                    -- optional: floor this flat sits on, used to auto-fill Flat-level incidents
  flat_number TEXT NOT NULL,
  owner_name TEXT,
  resident_name TEXT,
  mobile_number TEXT,
  email TEXT,
  occupancy_status TEXT NOT NULL DEFAULT 'Occupied', -- Occupied / Vacant / Rented
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(block_id, flat_number)
);

CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE   -- Administrator, Maker, Supervisor, Resident
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER REFERENCES communities(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  mobile_number TEXT,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS violation_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS penalty_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES violation_categories(id),
  warnings_before_penalty INTEGER NOT NULL DEFAULT 1,
  penalty_amount REAL NOT NULL DEFAULT 0,
  effective_date TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_number TEXT NOT NULL UNIQUE,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  incident_level TEXT NOT NULL DEFAULT 'Flat',  -- Community / Block / Floor / Flat
  block_id INTEGER REFERENCES blocks(id),        -- nullable: not applicable at Community level
  floor TEXT,                                    -- nullable: only applicable at Floor and Flat level
  flat_id INTEGER REFERENCES flats(id),           -- nullable: only applicable at Flat level
  category_id INTEGER NOT NULL REFERENCES violation_categories(id),
  incident_date TEXT NOT NULL,
  incident_time TEXT,
  gps_lat REAL,
  gps_lng REAL,
  remarks TEXT,
  maker_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Pending Approval', -- Pending Approval / Approved / Rejected / Condoned
  supervisor_id INTEGER REFERENCES users(id),
  supervisor_remarks TEXT,
  decided_at TEXT,
  resolution TEXT,  -- Warning / Penalty (set when Approved)
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS incident_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  file_path TEXT NOT NULL,
  thumb_path TEXT,
  original_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  flat_id INTEGER NOT NULL REFERENCES flats(id),
  category_id INTEGER NOT NULL REFERENCES violation_categories(id),
  warning_number INTEGER NOT NULL, -- sequence within category for this flat
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS penalties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  penalty_number TEXT NOT NULL UNIQUE,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  flat_id INTEGER NOT NULL REFERENCES flats(id),
  category_id INTEGER NOT NULL REFERENCES violation_categories(id),
  penalty_amount REAL NOT NULL,
  penalty_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Outstanding', -- Outstanding / Paid / Waived
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communication_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id),
  flat_id INTEGER REFERENCES flats(id),
  channel TEXT NOT NULL,  -- Email / SMS / WhatsApp
  recipient TEXT,
  subject TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'Sent', -- Sent / Failed / Simulated
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS communication_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL REFERENCES communities(id),
  channel TEXT NOT NULL,
  event_type TEXT NOT NULL, -- Warning / Penalty
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,                -- denormalized for immutability
  user_role TEXT,                -- denormalized for immutability
  action TEXT NOT NULL,          -- LOGIN, LOGOUT, CREATE, UPDATE, APPROVE, REJECT, DELETE, DEACTIVATE
  entity_type TEXT,
  entity_id INTEGER,
  module TEXT,                   -- community, flat, block, incident, etc.
  old_values TEXT,               -- JSON snapshot before change
  new_values TEXT,               -- JSON snapshot after change
  action_type TEXT,              -- normalized: CREATE, EDIT, DELETE, DEACTIVATE
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes are created in db/index.js, after migration runs, so that a
-- pre-enhancement database (which lacks incidents.incident_level until
-- migrated) never hits "CREATE INDEX ... on incident_level" before that
-- column exists.
