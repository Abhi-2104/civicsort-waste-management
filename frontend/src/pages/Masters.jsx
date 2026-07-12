import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage } from '../api';

export default function Masters() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get('flat') ? 'flats' : 'community');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Community &amp; Flats</h1>
          <p className="desc">Manage community details, blocks/towers, and the flat registry — all configurable without touching code.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-btn${tab === 'community' ? ' active' : ''}`} onClick={() => setTab('community')}>Community</button>
        <button className={`tab-btn${tab === 'blocks' ? ' active' : ''}`} onClick={() => setTab('blocks')}>Blocks</button>
        <button className={`tab-btn${tab === 'flats' ? ' active' : ''}`} onClick={() => setTab('flats')}>Flats</button>
      </div>

      {tab === 'community' && <CommunityTab />}
      {tab === 'blocks' && <BlocksTab />}
      {tab === 'flats' && <FlatsTab highlightFlat={params.get('flat')} />}
    </div>
  );
}

function CommunityTab() {
  const [form, setForm] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { api.get('/masters/community').then(res => setForm(res.data)); }, []);

  async function save(e) {
    e.preventDefault();
    await api.put('/masters/community', form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!form) return <div className="empty-state">Loading…</div>;

  return (
    <form className="card card-pad" style={{ maxWidth: 520 }} onSubmit={save}>
      {saved && <div className="banner banner-success">Community details saved.</div>}
      <div className="field">
        <label>Community name</label>
        <input value={form.name || ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
      </div>
      <div className="field">
        <label>Address</label>
        <textarea rows={2} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Contact phone</label>
          <input value={form.contact_phone || ''} onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))} />
        </div>
        <div className="field">
          <label>Contact email</label>
          <input value={form.contact_email || ''} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
        </div>
      </div>
      <button className="btn btn-primary">Save changes</button>
    </form>
  );
}

function BlocksTab() {
  const [blocks, setBlocks] = useState(null);
  const [form, setForm] = useState({ name: '', ward: '', street: '' });
  const [error, setError] = useState('');

  const load = () => api.get('/masters/blocks').then(res => setBlocks(res.data));
  useEffect(() => { load(); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/blocks', form);
      setForm({ name: '', ward: '', street: '' });
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function toggleActive(b) {
    await api.put(`/masters/blocks/${b.id}`, { ...b, is_active: b.is_active ? 0 : 1 });
    load();
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Block / Tower</th><th>Ward</th><th>Street</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {blocks && blocks.map(b => (
                <tr key={b.id}>
                  <td>{b.name}</td><td>{b.ward || '—'}</td><td>{b.street || '—'}</td>
                  <td><span className="chip">{b.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggleActive(b)}>{b.is_active ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {blocks && blocks.length === 0 && <div className="empty-state">No blocks configured yet.</div>}
        </div>
      </div>
      <form className="card card-pad" onSubmit={add} style={{ alignSelf: 'start' }}>
        <h3 style={{ fontSize: 14, marginBottom: 12 }}>Add block / tower</h3>
        {error && <div className="banner banner-error">{error}</div>}
        <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
        <div className="field"><label>Ward</label><input value={form.ward} onChange={e => setForm(f => ({ ...f, ward: e.target.value }))} /></div>
        <div className="field"><label>Street</label><input value={form.street} onChange={e => setForm(f => ({ ...f, street: e.target.value }))} /></div>
        <button className="btn btn-primary"><Plus size={14} /> Add block</button>
      </form>
    </div>
  );
}

function FlatsTab({ highlightFlat }) {
  const [flats, setFlats] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ block_id: '', flat_number: '', owner_name: '', resident_name: '', mobile_number: '', email: '', occupancy_status: 'Occupied' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.get('/masters/flats', { params: search ? { search } : {} }).then(res => setFlats(res.data));
  useEffect(() => { load(); }, [search]);
  useEffect(() => { api.get('/masters/blocks').then(res => setBlocks(res.data)); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/flats', form);
      setForm({ block_id: '', flat_number: '', owner_name: '', resident_name: '', mobile_number: '', email: '', occupancy_status: 'Occupied' });
      setShowForm(false);
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function saveEdit(e) {
    e.preventDefault();
    await api.put(`/masters/flats/${editing.id}`, editing);
    setEditing(null);
    load();
  }

  return (
    <div>
      <div className="toolbar">
        <input type="text" placeholder="Search flat / resident / mobile" value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 260 }} />
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><Plus size={14} /> Add flat</button>
      </div>

      {showForm && (
        <form className="card card-pad" onSubmit={add} style={{ marginBottom: 16 }}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="field-row">
            <div className="field"><label>Block</label>
              <select value={form.block_id} onChange={e => setForm(f => ({ ...f, block_id: e.target.value }))} required>
                <option value="">Select block</option>
                {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Flat number</label>
              <input value={form.flat_number} onChange={e => setForm(f => ({ ...f, flat_number: e.target.value }))} required />
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Owner name</label><input value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))} /></div>
            <div className="field"><label>Resident name</label><input value={form.resident_name} onChange={e => setForm(f => ({ ...f, resident_name: e.target.value }))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Mobile number</label><input value={form.mobile_number} onChange={e => setForm(f => ({ ...f, mobile_number: e.target.value }))} /></div>
            <div className="field"><label>Email</label><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="field">
            <label>Occupancy status</label>
            <select value={form.occupancy_status} onChange={e => setForm(f => ({ ...f, occupancy_status: e.target.value }))}>
              <option>Occupied</option><option>Vacant</option><option>Rented</option>
            </select>
          </div>
          <button className="btn btn-primary">Save flat</button>
        </form>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Block</th><th>Flat</th><th>Resident</th><th>Mobile</th><th>Email</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {flats && flats.map(f => (
                <tr key={f.id} style={{ background: String(f.id) === highlightFlat ? 'var(--primary-tint)' : undefined }}>
                  <td>{f.block_name}</td><td>{f.flat_number}</td><td>{f.resident_name || '—'}</td>
                  <td>{f.mobile_number || '—'}</td><td>{f.email || '—'}</td>
                  <td><span className="chip">{f.occupancy_status}</span></td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => setEditing(f)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {flats && flats.length === 0 && <div className="empty-state">No flats found.</div>}
        </div>
      </div>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal-box" onClick={e => e.stopPropagation()} onSubmit={saveEdit}>
            <h3 style={{ fontSize: 15, marginBottom: 14 }}>Edit Flat {editing.flat_number}</h3>
            <div className="field-row">
              <div className="field"><label>Owner name</label><input value={editing.owner_name || ''} onChange={e => setEditing(f => ({ ...f, owner_name: e.target.value }))} /></div>
              <div className="field"><label>Resident name</label><input value={editing.resident_name || ''} onChange={e => setEditing(f => ({ ...f, resident_name: e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Mobile</label><input value={editing.mobile_number || ''} onChange={e => setEditing(f => ({ ...f, mobile_number: e.target.value }))} /></div>
              <div className="field"><label>Email</label><input value={editing.email || ''} onChange={e => setEditing(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <div className="field">
              <label>Occupancy status</label>
              <select value={editing.occupancy_status} onChange={e => setEditing(f => ({ ...f, occupancy_status: e.target.value }))}>
                <option>Occupied</option><option>Vacant</option><option>Rented</option>
              </select>
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={!!editing.is_active} onChange={e => setEditing(f => ({ ...f, is_active: e.target.checked ? 1 : 0 }))} style={{ width: 'auto' }} />
              <label style={{ margin: 0 }}>Active</label>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn btn-primary">Save changes</button>
              <button type="button" className="btn btn-outline" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
