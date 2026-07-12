import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// ── Step 1: Restore DB from Drive before touching any routes ─────────────────
// driveSync.js doesn't import the DB, so it's safe to import first.
// Routes are loaded dynamically AFTER restore so better-sqlite3 opens the
// already-restored file instead of creating a fresh empty one.
import { driveConfigured, restoreDB, startSyncWatcher } from './services/driveSync.js';
if (driveConfigured()) {
  await restoreDB();
}

// ── Step 2: Load routes (this initializes the SQLite connection) ──────────────
const { default: authRoutes }     = await import('./routes/auth.js');
const { default: mastersRoutes }  = await import('./routes/masters.js');
const { default: incidentsRoutes }= await import('./routes/incidents.js');
const { default: reportsRoutes }  = await import('./routes/reports.js');
const { default: dashboardRoutes }= await import('./routes/dashboard.js');
const { default: uploadRoutes }   = await import('./routes/upload.js');
const { default: dbExplorerRoutes } = await import('./routes/dbExplorer.js');

// ── Step 3: Express app ───────────────────────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan('tiny'));

// Basic input hardening
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Static photo serving (fallback for locally-stored photos)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth',      authRoutes);
app.use('/api/masters',   mastersRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/reports',   reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/upload',    uploadRoutes);
app.use('/api/db-explorer', dbExplorerRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'MulterError') return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Waste Monitoring API listening on port ${PORT}`);
  // ── Step 4: Start smart Drive sync watcher after server is up ──────────────
  startSyncWatcher();
});
