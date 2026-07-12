# CivicSort — Community Waste Disposal Monitoring & Penalty Management System

A working full-stack MVP implementing the core workflow: capture a violation with
photo evidence → supervisor approves/rejects/condones → system automatically
issues a warning or penalty based on configurable rules → resident is notified →
management reports show the full picture.

Login as **admin@demo.com / password123** (see more demo accounts below) once running.

---

## 1. What's implemented vs. what's scoped out

This was built as a working MVP in one session, not a multi-week team build. Everything
below is real, running code — not a mockup — but a few of the 17 requested deliverables
were deliberately trimmed so the core system could be solid rather than everything being shallow.

**Fully implemented and tested:**
- Master configuration (community, blocks/towers, flats) — no code changes needed to configure
- Configurable violation categories and penalty rules (warnings-before-penalty + amount, versioned by effective date)
- Incident capture with multi-photo upload (camera or gallery), automatic compression + thumbnails
- Approval workflow: Pending → Approved / Rejected / Condoned, with remarks
- **Automatic warning/penalty engine** — approving an incident checks the flat's prior approved
  history for that category and issues a Warning or a Penalty per the configured rule (verified:
  2 warnings then auto-penalty on the 3rd approved incident, matching the spec example)
- Resident communication on approval (template-based, logged to a communication log — see note below)
- 5 reports: Incident, Penalty (with "mark paid"), Block-wise Summary, Resident History, Violation Trend
  (weekly/monthly/yearly, with category breakdown) — all with CSV export
- Bulk resident upload via CSV with per-row validation (duplicate flat, missing mobile/email, invalid block)
  and a downloadable template
- Role-based access control (Administrator / Maker / Supervisor) enforced on every write endpoint
- Dashboard with live counts, block-wise and monthly charts, top blocks/categories
- Global search (flat / incident # / penalty #), notifications for pending approvals & unpaid penalties
- Full audit log (login, logout, create, update, approve, reject) — append-only, no edit/delete endpoint exists
- JWT auth, bcrypt password hashing, security headers, input validation

**Scoped out / stubbed — see "Extending this" below for what's needed:**
- **Email/SMS/WhatsApp** are simulated: every notification is fully rendered from its template and
  written to `communication_log`, but no real provider (SendGrid/Twilio/etc.) is wired up. This was
  the single highest-effort/lowest-learning item to fake convincingly, so it's a clean stub instead.
- **PDF and Excel export** — reports export to CSV (opens in Excel) rather than native `.xlsx`/`.pdf`.
  Real PDF/Excel generation is straightforward to add (see below) but was cut to keep the core engine solid.
- **Automated tests** — none included. The workflow was manually verified end-to-end (see §5).
- **Docker/cloud deployment configs** — not included; deployment notes are below but not automated.
- Resident login, online payment, QR collection, offline mode, AI photo verification — explicitly
  listed as *future enhancements* in the spec, not built, and the schema doesn't block adding them later.

If any of these matter most to you, tell me which one and I'll build it out properly rather than
spreading effort thin across all of them.

---

## 2. Architecture

```
Browser (React SPA, Vite)
   │  REST/JSON + multipart (photos)
   ▼
Express API (Node.js)
   │  better-sqlite3 (synchronous, file-based — swap for Postgres in production, see §7)
   ▼
SQLite database (waste.db)
   +
   /uploads (compressed photos + thumbnails, served statically)
```

- **Backend**: Node.js + Express, `better-sqlite3` for the database, `multer` for uploads,
  `sharp` for image compression/thumbnailing, `jsonwebtoken` + `bcryptjs` for auth,
  `csv-parse`/`json2csv` for bulk upload and report export.
- **Frontend**: React 19 + Vite, `react-router-dom`, `recharts` for charts, `lucide-react` for icons.
  No UI framework — hand-built design system in `src/theme.css`.
- **Multi-community ready**: every table that needs it carries a `community_id`; every query filters
  by the logged-in user's community. A single deployment currently seeds one community, but the schema
  and API already support more than one — you'd add a community switcher to the UI and a way to assign
  users/flats to different communities.

### Why SQLite instead of Postgres/MySQL as specified?
For a runnable MVP, SQLite means zero setup — no separate database server to install and connect to.
The queries are plain SQL with only minor SQLite-specific syntax (`datetime('now')`, `strftime`), so
migrating to PostgreSQL is a schema/driver swap, not a rewrite. See §7 for the migration path.

---

## 3. Project layout

```
waste-app/
├── backend/
│   ├── db/
│   │   ├── schema.sql       # full normalized schema (16 tables)
│   │   ├── index.js         # DB connection + schema init + sequence numbering
│   │   └── seed.js          # demo community, users, blocks, flats, categories, rules
│   ├── middleware/auth.js   # JWT verification, RBAC, audit logging helper
│   ├── routes/
│   │   ├── auth.js          # login / logout / me
│   │   ├── masters.js       # community, blocks, flats, users, categories, penalty rules
│   │   ├── incidents.js     # capture, photo upload, approve/reject/condone, penalty engine
│   │   ├── upload.js        # bulk resident CSV upload + template
│   │   ├── reports.js       # 5 reports + CSV export
│   │   └── dashboard.js     # summary stats, search, notifications, audit log
│   ├── services/communication.js  # template rendering + simulated send + logging
│   └── server.js
└── frontend/
    └── src/
        ├── api.js                    # axios client, JWT injection, 401 handling
        ├── context/AuthContext.jsx
        ├── components/Layout.jsx, StatusBadge.jsx
        └── pages/  Login, Dashboard, IncidentsList, IncidentCapture, IncidentDetail,
                    Masters, Categories, UsersAdmin, ResidentUpload, Reports, Audit
```

---

## 4. Running it locally

Requires Node.js 18+.

```bash
# Backend
cd backend
npm install
npm run seed      # creates waste.db with demo data (safe to re-run)
npm start          # → http://localhost:4000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev         # → http://localhost:5173
```

The frontend reads the API URL from `frontend/.env` (`VITE_API_BASE`), defaulting to `http://localhost:4000`.

**Demo accounts (password: `password123` for all):**
| Role | Email |
|---|---|
| Administrator | admin@demo.com |
| Maker | maker@demo.com |
| Supervisor | supervisor@demo.com |

Seed data includes one community ("Green Meadows Residency"), 3 blocks, 5 flats per block,
4 violation categories with penalty rules pre-configured exactly as in the spec example
(Mixed Waste: 3 warnings/₹500, Dry Waste on wrong day: 2 warnings/₹200, etc.).

---

## 5. How the warning/penalty engine works (verified)

On `POST /api/incidents/:id/decision` with `decision: "Approved"`:
1. Look up the active penalty rule for the incident's category (`warnings_before_penalty`, `penalty_amount`).
2. Count this flat's prior **approved** incidents in the same category that resulted in a Warning.
3. If that count is below the allowed warnings → insert a `warnings` row, resolution = `Warning`.
4. Otherwise → insert a `penalties` row with a generated penalty number and the configured amount,
   resolution = `Penalty`.
5. Either way, the resident communication is rendered from the matching template and logged.

Rejected and Condoned incidents never reach this logic — they're archived but don't count.

This was tested end-to-end against the "Dry Waste on Non-designated Day" rule (2 warnings, ₹200):
incident 1 → Warning #1, incident 2 → Warning #2, incident 3 → automatic Penalty of ₹200. Matches
the spec's worked example.

---

## 6. REST API summary

All routes except `/api/auth/login` and `/api/health` require `Authorization: Bearer <token>`.

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` |
| Masters | `GET/PUT /api/masters/community`, `GET/POST/PUT /api/masters/blocks`, `GET/POST/PUT /api/masters/flats`, `GET/POST/PUT /api/masters/users`, `GET/POST/PUT /api/masters/categories`, `GET/POST/PUT /api/masters/penalty-rules` |
| Incidents | `GET /api/incidents` (filterable), `GET /api/incidents/:id`, `POST /api/incidents` (multipart, field `photos`), `POST /api/incidents/:id/decision` |
| Bulk upload | `GET /api/upload/residents/template`, `POST /api/upload/residents` (multipart, field `file`) |
| Reports | `GET /api/reports/incidents`, `/penalties`, `/block-summary`, `/resident/:flatId`, `/trend` — all accept `?export=csv`; `PUT /api/reports/penalties/:id/pay` |
| Dashboard | `GET /api/dashboard/summary`, `/search?q=`, `/notifications`, `/audit` (admin only) |

Roles: `Administrator` (full config access), `Maker` (capture incidents), `Supervisor` (approve/reject/condone,
view reports). Write endpoints check role via the `authorize(...)` middleware; unauthorized calls return 403.

---

## 7. Deployment notes

**Moving from SQLite to PostgreSQL:**
- Swap `better-sqlite3` for `pg`, convert `db.prepare(...).run/get/all` calls to parameterized `pg` queries
  (mechanical but touches every route file).
- `datetime('now')` → `now()`, `strftime(...)` → `to_char(...)`, `AUTOINCREMENT` → `SERIAL`/`IDENTITY`.
- The schema in `db/schema.sql` is already normalized to 3NF and maps cleanly to Postgres types.

**Docker (suggested shape, not included):**
- `backend` container: Node image, mount a volume for `/uploads` (or point at S3/Blob storage instead —
  recommended for real deployments so photos survive container restarts and scale across instances).
- `frontend` container: build with `npm run build`, serve `dist/` via nginx, proxy `/api` and `/uploads`
  to the backend container.
- `db` container: Postgres, with the schema applied via an init script.

**Production hardening before go-live:**
- Move `JWT_SECRET` out of the code default into a real secret manager.
- Put uploaded photos behind signed URLs or an authenticated proxy route instead of plain static serving.
- Wire `services/communication.js`'s `simulateSend` to a real Email/SMS/WhatsApp provider — the
  template rendering and logging around it don't need to change.
- Add rate limiting on `/api/auth/login`.
- Add the automated test suite (Jest + supertest for the API is a natural fit given the route structure).

---

## 8. Extending this

- **Real Excel/PDF export**: swap the CSV export in `reports.js` for `exceljs` (Excel) and `pdfkit` or
  a headless-Chrome print (PDF) — the query logic stays identical, only the response serialization changes.
- **Resident portal / online payment**: the `penalties` table already has a `status` field
  (`Outstanding`/`Paid`/`Waived`); a resident-facing app would just need its own JWT role and a
  payment-gateway webhook that flips that status.
- **WhatsApp / real SMS**: replace `simulateSend()` in `services/communication.js`.
- **Multi-community switcher**: the data model already scopes everything by `community_id`; add a
  community selector to the login flow or topbar for users who belong to more than one.
