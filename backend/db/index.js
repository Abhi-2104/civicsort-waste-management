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
