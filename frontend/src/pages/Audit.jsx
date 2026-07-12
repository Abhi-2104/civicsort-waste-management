import { useEffect, useState } from 'react';
import { api } from '../api';

export default function Audit() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/dashboard/audit').then(res => setRows(res.data)); }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Insights</div>
          <h1>Audit Trail</h1>
          <p className="desc">Every login, creation, modification, approval, and deletion — permanently recorded and never editable.</p>
        </div>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>IP</th></tr></thead>
            <tbody>
              {rows && rows.map(r => (
                <tr key={r.id}>
                  <td className="num">{r.created_at}</td>
                  <td>{r.user_name || 'System'}</td>
                  <td><span className="chip">{r.action}</span></td>
                  <td>{r.entity_type ? `${r.entity_type} #${r.entity_id ?? ''}` : '—'}</td>
                  <td className="num">{r.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && rows.length === 0 && <div className="empty-state">No audit events yet.</div>}
        </div>
      </div>
    </div>
  );
}
