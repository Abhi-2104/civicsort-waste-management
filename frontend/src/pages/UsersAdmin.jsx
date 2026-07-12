import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage } from '../api';

export default function UsersAdmin() {
  const [users, setUsers] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', mobile_number: '', password: '', role: 'Maker' });
  const [error, setError] = useState('');

  const load = () => api.get('/masters/users').then(res => setUsers(res.data));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/users', form);
      setForm({ name: '', email: '', mobile_number: '', password: '', role: 'Maker' });
      setShowForm(false);
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function toggleActive(u) {
    await api.put(`/masters/users/${u.id}`, { name: u.name, mobile_number: u.mobile_number, role: u.role, is_active: u.is_active ? 0 : 1 });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Users</h1>
          <p className="desc">Administrators configure the system; Makers capture incidents; Supervisors approve, reject, or condone them.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><Plus size={14} /> Add user</button>
      </div>

      {showForm && (
        <form className="card card-pad" onSubmit={add} style={{ marginBottom: 16, maxWidth: 480 }}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="field"><label>Full name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required /></div>
            <div className="field"><label>Mobile</label><input value={form.mobile_number} onChange={e => setForm(f => ({ ...f, mobile_number: e.target.value }))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Temporary password</label><input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required /></div>
            <div className="field"><label>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                <option>Administrator</option><option>Maker</option><option>Supervisor</option>
              </select>
            </div>
          </div>
          <button className="btn btn-primary">Create user</button>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users && users.map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td><td>{u.email}</td><td>{u.mobile_number || '—'}</td>
                  <td><span className="chip">{u.role}</span></td>
                  <td><span className="chip">{u.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
