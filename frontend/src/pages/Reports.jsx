import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import { api, API_BASE } from '../api';
import StatusBadge from '../components/StatusBadge';

const TABS = ['Incidents', 'Penalties', 'Block Summary', 'Resident History', 'Trend'];

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
  const [filters, setFilters] = useState({ from: '', to: '', status: '' });
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
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option>Pending Approval</option><option>Approved</option><option>Rejected</option><option>Condoned</option>
        </select>
        <div style={{ marginLeft: 'auto' }}><ExportButton path="/reports/incidents" params={filters} /></div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Incident #</th><th>Date</th><th>Block</th><th>Flat</th><th>Category</th><th>Status</th><th>Resolution</th><th>Maker</th></tr></thead>
            <tbody>
              {rows && rows.map((r, i) => (
                <tr key={i}>
                  <td className="num">{r.incident_number}</td><td>{r.incident_date}</td><td>{r.block}</td><td>{r.flat_number}</td>
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
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/reports/block-summary').then(res => setRows(res.data)); }, []);
  return (
    <div>
      <div className="toolbar"><div style={{ marginLeft: 'auto' }}><ExportButton path="/reports/block-summary" params={{}} /></div></div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Block</th><th>Total violations</th><th>Warnings</th><th>Penalties</th><th>Penalty amount</th></tr></thead>
            <tbody>
              {rows && rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.block}</td><td className="num">{r.total_violations}</td><td className="num">{r.warnings}</td>
                  <td className="num">{r.penalties}</td><td className="num">₹{r.penalty_amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResidentHistory() {
  const [flats, setFlats] = useState([]);
  const [flatId, setFlatId] = useState('');
  const [history, setHistory] = useState(null);

  useEffect(() => { api.get('/masters/flats').then(res => setFlats(res.data)); }, []);
  useEffect(() => {
    if (!flatId) { setHistory(null); return; }
    api.get(`/reports/resident/${flatId}`).then(res => setHistory(res.data));
  }, [flatId]);

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
