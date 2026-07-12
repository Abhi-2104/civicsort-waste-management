import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function IncidentsList({ fixedStatus }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [incidents, setIncidents] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ status: fixedStatus || '', block_id: '', category_id: '', search: '' });

  const load = useCallback(() => {
    const params = { ...filters };
    if (fixedStatus) params.status = fixedStatus;
    Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
    api.get('/incidents', { params }).then(res => setIncidents(res.data));
  }, [filters, fixedStatus]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/masters/blocks').then(res => setBlocks(res.data));
    api.get('/masters/categories').then(res => setCategories(res.data));
  }, []);

  const canCreate = user.role === 'Administrator' || user.role === 'Maker';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{fixedStatus ? 'Workflow' : 'Operations'}</div>
          <h1>{fixedStatus ? 'Pending Approvals' : 'Incidents'}</h1>
          <p className="desc">
            {fixedStatus
              ? 'Review evidence and decide: approve, reject, or condone. Only approved incidents count toward warnings and penalties.'
              : 'Every waste-disposal violation captured by field staff, from first sighting through to resolution.'}
          </p>
        </div>
        {canCreate && !fixedStatus && (
          <button className="btn btn-primary" onClick={() => navigate('/incidents/new')}><Plus size={15} /> Capture incident</button>
        )}
      </div>

      {!fixedStatus && (
        <div className="toolbar">
          <Filter size={14} color="var(--ink-soft)" />
          <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option>Pending Approval</option>
            <option>Approved</option>
            <option>Rejected</option>
            <option>Condoned</option>
          </select>
          <select value={filters.block_id} onChange={e => setFilters(f => ({ ...f, block_id: e.target.value }))}>
            <option value="">All blocks</option>
            {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={filters.category_id} onChange={e => setFilters(f => ({ ...f, category_id: e.target.value }))}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input type="text" placeholder="Search flat / incident #" value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} />
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Incident #</th><th>Date</th><th>Block</th><th>Flat</th><th>Resident</th>
                <th>Category</th><th>Status</th><th>Resolution</th><th>Maker</th>
              </tr>
            </thead>
            <tbody>
              {incidents && incidents.map(i => (
                <tr key={i.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/incidents/${i.id}`)}>
                  <td className="num">{i.incident_number}</td>
                  <td>{i.incident_date}</td>
                  <td>{i.block_name}</td>
                  <td>{i.flat_number}</td>
                  <td>{i.resident_name || '—'}</td>
                  <td>{i.category_name}</td>
                  <td><StatusBadge status={i.status} /></td>
                  <td>{i.resolution ? <StatusBadge status={i.resolution} /> : '—'}</td>
                  <td>{i.maker_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {incidents && incidents.length === 0 && (
            <div className="empty-state">
              {fixedStatus ? 'Nothing waiting on you right now.' : 'No incidents match these filters yet.'}
            </div>
          )}
          {!incidents && <div className="empty-state">Loading…</div>}
        </div>
      </div>
    </div>
  );
}
