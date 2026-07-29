import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { api } from '../api';

export default function Audit() {
  const [rows, setRows] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => { api.get('/dashboard/audit').then(res => setRows(res.data)); }, []);

  const filteredRows = rows?.filter(r => {
    if (filterModule && r.module !== filterModule) return false;
    if (filterAction && r.action_type !== filterAction && r.action !== filterAction) return false;
    if (filterFrom && r.created_at < filterFrom) return false;
    if (filterTo && r.created_at > filterTo + 'T23:59:59') return false;
    return true;
  });

  // Derive unique modules & actions from data for filter dropdowns
  const modules = rows ? [...new Set(rows.map(r => r.module).filter(Boolean))].sort() : [];
  const actions = rows ? [...new Set(rows.map(r => r.action_type || r.action).filter(Boolean))].sort() : [];

  function toggleExpand(id) {
    setExpandedId(prev => prev === id ? null : id);
  }

  function formatJson(val) {
    if (!val) return null;
    try {
      const obj = typeof val === 'string' ? JSON.parse(val) : val;
      return JSON.stringify(obj, null, 2);
    } catch { return String(val); }
  }

  const hasFilters = filterModule || filterAction || filterFrom || filterTo;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1>Audit Trail</h1>
          <p className="desc">Every login, creation, modification, approval, and deletion — permanently recorded and never editable.</p>
        </div>
      </div>

      {/* ── Filter toolbar ── */}
      <div className="audit-filters">
        <Filter size={14} style={{ color: 'var(--ink-soft)' }} />
        <select value={filterModule} onChange={e => setFilterModule(e.target.value)}>
          <option value="">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} title="From date" />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} title="To date" />
        {hasFilters && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setFilterModule(''); setFilterAction(''); setFilterFrom(''); setFilterTo(''); }}>
            Clear
          </button>
        )}
        {filteredRows && <span className="text-muted" style={{ fontSize: 12, marginLeft: 'auto' }}>{filteredRows.length} record(s)</span>}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th>When</th>
                <th>User</th>
                <th>Role</th>
                <th>Action</th>
                <th>Module</th>
                <th>Entity</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows && filteredRows.map(r => {
                const hasDetails = r.old_values || r.new_values || r.details;
                const isExpanded = expandedId === r.id;
                return (
                  <AuditRow
                    key={r.id}
                    row={r}
                    hasDetails={hasDetails}
                    isExpanded={isExpanded}
                    onToggle={() => toggleExpand(r.id)}
                    formatJson={formatJson}
                  />
                );
              })}
            </tbody>
          </table>
          {filteredRows && filteredRows.length === 0 && <div className="empty-state">No audit events match your filters.</div>}
        </div>
      </div>
    </div>
  );
}

function AuditRow({ row: r, hasDetails, isExpanded, onToggle, formatJson }) {
  return (
    <>
      <tr>
        <td>
          {hasDetails ? (
            <button className="audit-expand-btn" onClick={onToggle} title={isExpanded ? 'Collapse' : 'Show changes'}>
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </td>
        <td className="num">{r.created_at}</td>
        <td>{r.user_name || r.user_id || 'System'}</td>
        <td><span className="chip">{r.user_role || '—'}</span></td>
        <td><span className="chip">{r.action_type || r.action}</span></td>
        <td>{r.module || '—'}</td>
        <td>{r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : '—'}</td>
        <td className="num">{r.ip_address || '—'}</td>
      </tr>
      {isExpanded && hasDetails && (
        <tr>
          <td colSpan={8} style={{ padding: '0 14px 12px' }}>
            <div className="json-diff">
              {r.old_values && (
                <div className="json-diff-col old">
                  <h5>Before (Old Values)</h5>
                  <pre>{formatJson(r.old_values)}</pre>
                </div>
              )}
              {r.new_values && (
                <div className="json-diff-col new">
                  <h5>After (New Values)</h5>
                  <pre>{formatJson(r.new_values)}</pre>
                </div>
              )}
              {!r.old_values && !r.new_values && r.details && (
                <div className="json-diff-col">
                  <h5>Details</h5>
                  <pre>{formatJson(r.details)}</pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
