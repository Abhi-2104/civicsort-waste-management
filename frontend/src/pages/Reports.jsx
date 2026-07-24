import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { api, API_BASE } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge, { LevelBadge } from '../components/StatusBadge';

const TABS = ['Incidents', 'Penalties', 'Block Summary', 'Consolidated', 'Resident History', 'Trend'];

export default function Reports() {
  const [tab, setTab] = useState('Incidents');
  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1>Reports</h1>
          <p className="desc">Filter, review, and export compliance data for management review.</p>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(t => <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'Incidents' && <IncidentReport />}
      {tab === 'Penalties' && <PenaltyReport />}
      {tab === 'Block Summary' && <BlockSummary />}
      {tab === 'Consolidated' && <Consolidated />}
      {tab === 'Resident History' && <ResidentHistory />}
      {tab === 'Trend' && <Trend />}
    </div>
  );
}

function exportUrl(path, params) {
  const token = localStorage.getItem('token');
  const query = new URLSearchParams({ ...params, export: 'csv' }).toString();
  return { url: `${API_BASE}/api${path}?${query}`, token };
}

function ExportButton({ path, params }) {
  async function download() {
    const { url, token } = exportUrl(path, params);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'report.csv';
    a.click();
  }
  return <button className="btn btn-outline btn-sm" onClick={download}><Download size={13} /> Export CSV</button>;
}

function IncidentReport() {
  const [filters, setFilters] = useState({ from: '', to: '', status: '', incident_level: '' });
  const [rows, setRows] = useState(null);
  useEffect(() => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get('/reports/incidents', { params }).then(res => setRows(res.data));
  }, [filters]);

  return (
    <div>
      <div className="toolbar">
        <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <select value={filters.incident_level} onChange={e => setFilters(f => ({ ...f, incident_level: e.target.value }))}>
          <option value="">All levels</option>
          <option>Community</option><option>Block</option><option>Floor</option><option>Flat</option>
        </select>
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option>Pending Approval</option><option>Approved</option><option>Rejected</option><option>Condoned</option>
        </select>
        <div style={{ marginLeft: 'auto' }}><ExportButton path="/reports/incidents" params={filters} /></div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Incident #</th><th>Date</th><th>Level</th><th>Block</th><th>Floor</th><th>Flat</th><th>Category</th><th>Status</th><th>Resolution</th><th>Maker</th></tr></thead>
            <tbody>
              {rows && rows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{r.incident_number}</td><td>{r.incident_date}</td>
                  <td><LevelBadge level={r.incident_level} /></td>
                  <td>{r.block || '—'}</td><td>{r.floor || '—'}</td><td>{r.flat_number || '—'}</td>
                  <td>{r.category}</td><td><StatusBadge status={r.status} /></td>
                  <td>{r.resolution ? <StatusBadge status={r.resolution} /> : '—'}</td><td>{r.maker}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && rows.length === 0 && <div className="empty-state">No incidents match these filters.</div>}
        </div>
      </div>
    </div>
  );
}

function PenaltyReport() {
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
  const [data, setData] = useState(null);
  const load = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get('/reports/penalties', { params }).then(res => setData(res.data));
  };
  useEffect(() => { load(); }, [filters]);

  async function markPaid(id) {
    await api.put(`/reports/penalties/${id}/pay`);
    load();
  }

  return (
    <div>
      <div className="toolbar">
        <input type="date" value={filters.from} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} />
        <input type="date" value={filters.to} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} />
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option><option>Outstanding</option><option>Paid</option><option>Waived</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
          {data && <span className="field-hint">Total: ₹{data.total.toLocaleString('en-IN')}</span>}
          <ExportButton path="/reports/penalties" params={filters} />
        </div>
      </div>
      <p className="field-hint" style={{ marginBottom: 10 }}>
        Penalties are only ever generated for Flat-level incidents — Community, Block, and Floor-level incidents are logged and resolved through the same workflow but don't carry a monetary penalty today.
      </p>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Penalty #</th><th>Flat</th><th>Resident</th><th>Category</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {data && data.rows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{r.penalty_number}</td><td>{r.flat_number}</td><td>{r.resident_name || '—'}</td>
                  <td>{r.category}</td><td>{r.penalty_date}</td><td className="num">₹{r.penalty_amount}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.status === 'Outstanding' && <button className="btn btn-ghost btn-sm" onClick={() => markPaid(r.id)}>Mark paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data && data.rows.length === 0 && <div className="empty-state">No penalties match these filters.</div>}
        </div>
      </div>
    </div>
  );
}

function BlockSummary() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/reports/block-summary').then(res => setData(res.data)); }, []);
  if (!data) return <div className="empty-state">Loading…</div>;
  const { blocks, levelTotals } = data;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card accent-primary"><div className="label">Community incidents</div><div className="value">{levelTotals.Community}</div></div>
        <div className="stat-card"><div className="label">Block incidents</div><div className="value">{levelTotals.Block}</div></div>
        <div className="stat-card accent-warn"><div className="label">Floor incidents</div><div className="value">{levelTotals.Floor}</div></div>
        <div className="stat-card accent-penalty"><div className="label">Flat incidents</div><div className="value">{levelTotals.Flat}</div></div>
      </div>
      <div className="toolbar"><div style={{ marginLeft: 'auto' }}><ExportButton path="/reports/block-summary" params={{}} /></div></div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Block</th><th>Total approved violations</th><th>Warnings</th><th>Penalties</th><th>Penalty amount</th></tr></thead>
            <tbody>
              {blocks.map((r, i) => (
                <tr key={i}>
                  <td>{r.block}</td><td className="num">{r.total_violations}</td><td className="num">{r.warnings}</td>
                  <td className="num">{r.penalties}</td><td className="num">₹{r.penalty_amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="field-hint" style={{ marginTop: 10 }}>
        The per-block table counts approved Block/Floor/Flat-level incidents attributed to that block. Community-level incidents aren't tied to any single block, so they only appear in the totals above.
      </p>
    </div>
  );
}

function Consolidated() {
  const [data, setData] = useState(null);
  const [openBlocks, setOpenBlocks] = useState({});
  const [openFloors, setOpenFloors] = useState({});

  useEffect(() => { api.get('/reports/consolidated').then(res => setData(res.data)); }, []);
  if (!data) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <p className="field-hint" style={{ marginBottom: 14 }}>
        Every incident recorded for {data.community.name}, grouped Community → Block → Floor → Flat, with a running total at every level.
      </p>
      <div className="card card-pad">
        <RollupRow label={`${data.community.name} (Community-level)`} count={data.community.incidentCount} bold />
        <div style={{ marginLeft: 14, borderLeft: '2px solid var(--line)', paddingLeft: 14, marginTop: 6 }}>
          {data.blocks.map(block => (
            <div key={block.blockId} style={{ marginBottom: 4 }}>
              <RollupRow
                label={block.blockName} count={block.total} sublabel={`${block.incidentCount} block-level`}
                expandable onToggle={() => setOpenBlocks(o => ({ ...o, [block.blockId]: !o[block.blockId] }))}
                open={!!openBlocks[block.blockId]}
              />
              {openBlocks[block.blockId] && (
                <div style={{ marginLeft: 20, borderLeft: '2px solid var(--line-soft)', paddingLeft: 14, marginTop: 4 }}>
                  {block.floors.length === 0 && <div className="text-muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No floor or flat-level incidents in this block.</div>}
                  {block.floors.map((floor, fi) => {
                    const floorKey = `${block.blockId}-${floor.floor}`;
                    return (
                      <div key={fi} style={{ marginBottom: 4 }}>
                        <RollupRow
                          label={`Floor ${floor.floor}`} count={floor.total} sublabel={`${floor.incidentCount} floor-level`}
                          expandable onToggle={() => setOpenFloors(o => ({ ...o, [floorKey]: !o[floorKey] }))}
                          open={!!openFloors[floorKey]}
                        />
                        {openFloors[floorKey] && (
                          <div style={{ marginLeft: 20, borderLeft: '2px solid var(--line-soft)', paddingLeft: 14, marginTop: 4 }}>
                            {floor.flats.length === 0 && <div className="text-muted" style={{ fontSize: 12.5, padding: '4px 0' }}>No flat-level incidents on this floor.</div>}
                            {floor.flats.map(flat => (
                              <RollupRow key={flat.flatId} label={`Flat ${flat.flatNumber}`} count={flat.incidentCount} small />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
          <RollupRow label="Grand total" count={data.grandTotal} bold />
        </div>
      </div>
    </div>
  );
}

function RollupRow({ label, count, sublabel, bold, small, expandable, open, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: small ? '4px 0' : '7px 0', cursor: expandable ? 'pointer' : 'default',
      }}
      onClick={expandable ? onToggle : undefined}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: bold ? 700 : 500, fontSize: small ? 12.5 : 13.5 }}>
        {expandable && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        {label}
        {sublabel && <span className="text-muted" style={{ fontWeight: 400, fontSize: 11.5 }}>({sublabel})</span>}
      </span>
      <span className="mono" style={{ fontSize: 12.5, fontWeight: bold ? 700 : 500 }}>{count}</span>
    </div>
  );
}

function ResidentHistory() {
  const { user } = useAuth();
  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState('');
  const [history, setHistory] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => { api.get('/masters/flats').then(res => setFlats(res.data)); }, []);
  useEffect(() => {
    setRevealed(null);
    if (!flatId) { setHistory(null); return; }
    api.get(`/reports/resident/${flatId}`).then(res => setHistory(res.data));
  }, [flatId]);

  async function toggleReveal() {
    if (revealed) { setRevealed(null); return; }
    setRevealing(true);
    try {
      const res = await api.get(`/reports/resident/${flatId}`, { params: { unmask: true, reason: 'Reviewing resident history report' } });
      setRevealed({ mobile_number: res.data.flat.mobile_number, email: res.data.flat.email });
    } catch (err) {
      // stay masked on failure
    } finally {
      setRevealing(false);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <select value={flatId} onChange={e => setFlatId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">Select a flat…</option>
          {flats.map(f => <option key={f.id} value={f.id}>{f.block_name} — {f.flat_number} ({f.resident_name || 'Unassigned'})</option>)}
        </select>
      </div>
      {!history ? <div className="empty-state">Choose a flat to see its complete violation history.</div> : (
        <div>
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{history.flat.resident_name || 'Resident not on file'}</div>
                <div className="field-hint" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono">
                    {revealed ? `${revealed.mobile_number || '—'} · ${revealed.email || '—'}` : `${history.flat.mobile_number || '—'} · ${history.flat.email || '—'}`}
                  </span>
                  {user.role === 'Administrator' && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                      title={revealed ? 'Hide contact details' : 'Reveal contact details (logged to audit trail)'}
                      onClick={toggleReveal} disabled={revealing}>
                      {revealing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (revealed ? <EyeOff size={13} /> : <Eye size={13} />)}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <div className="stat-card"><div className="label">Total incidents</div><div className="value">{history.incidents.length}</div></div>
            <div className="stat-card accent-penalty"><div className="label">Penalties</div><div className="value">{history.penalties.length}</div></div>
            <div className="stat-card accent-penalty"><div className="label">Total penalty amount</div><div className="value">₹{history.penalties.reduce((s, p) => s + p.penalty_amount, 0)}</div></div>
          </div>
          <div className="card">
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Date</th><th>Category</th><th>Status</th><th>Resolution</th><th>Photos</th></tr></thead>
                <tbody>
                  {history.incidents.map(inc => (
                    <tr key={inc.id}>
                      <td>{inc.incident_date}</td><td>{inc.category_name}</td>
                      <td><StatusBadge status={inc.status} /></td>
                      <td>{inc.resolution ? <StatusBadge status={inc.resolution} /> : '—'}</td>
                      <td>{inc.photos.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {history.incidents.length === 0 && <div className="empty-state">No violations recorded for this flat.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Trend() {
  const [by, setBy] = useState('monthly');
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/reports/trend', { params: { by } }).then(res => setData(res.data)); }, [by]);

  return (
    <div>
      <div className="toolbar">
        <select value={by} onChange={e => setBy(e.target.value)}>
          <option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option>
        </select>
      </div>
      <div className="card card-pad">
        {!data || data.trend.length === 0 ? <div className="empty-state">Not enough approved incidents yet to show a trend.</div> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E9E7DC" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} stroke="#8B9A90" />
              <YAxis tick={{ fontSize: 11 }} stroke="#8B9A90" allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#2C6B4A" strokeWidth={2} name="Total" />
              <Line type="monotone" dataKey="warnings" stroke="#B9822B" strokeWidth={2} name="Warnings" />
              <Line type="monotone" dataKey="penalties" stroke="#A93B33" strokeWidth={2} name="Penalties" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
