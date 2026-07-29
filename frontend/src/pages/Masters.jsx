import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Eye, EyeOff, Pencil, Trash2, Search, X, Power } from 'lucide-react';
import { api, apiErrorMessage } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';

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

// ══════════════════════════════════════════════════════════════════════════════
// COMMUNITY TAB (Enhancement 14 — Full CRUD with grid)
// ══════════════════════════════════════════════════════════════════════════════

function CommunityTab() {
  const [communities, setCommunities] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteDeps, setDeleteDeps] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(() => {
    api.get('/masters/communities').then(res => setCommunities(res.data)).catch(() => {
      // Fallback to single-community for backward compat
      api.get('/masters/community').then(res => setCommunities(res.data ? [res.data] : []));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function saveEdit(e) {
    e.preventDefault();
    setError('');
    try {
      await api.put(`/masters/communities/${editing.id}`, editing);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setEditing(null);
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function handleDelete(community) {
    setDeleteError('');
    setDeleteDeps(null);
    try {
      await api.delete(`/masters/communities/${community.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      if (err.response?.status === 409) {
        setDeleteDeps(err.response.data);
      } else {
        setDeleteError(apiErrorMessage(err));
      }
    }
  }

  async function handleDeactivate(community) {
    try {
      await api.post(`/masters/communities/${community.id}/deactivate`);
      setDeleteTarget(null);
      setDeleteDeps(null);
      load();
    } catch (err) { setDeleteError(apiErrorMessage(err)); }
  }

  return (
    <div>
      {saved && <div className="banner banner-success">Community details saved.</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Community Name</th><th>Address</th><th>Phone</th><th>Email</th>
                <th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {communities && communities.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.address || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.contact_phone || '—'}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{c.contact_email || '—'}</td>
                  <td><span className={`chip ${c.is_active ? '' : 'chip-inactive'}`}>{c.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td>
                    <div className="action-icons">
                      <button className="icon-btn icon-btn-view" title="View details" onClick={() => setViewing(c)}>
                        <Eye size={15} />
                      </button>
                      <button className="icon-btn icon-btn-edit" title="Edit community" onClick={() => setEditing({ ...c })}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-btn icon-btn-danger" title="Delete community" onClick={() => setDeleteTarget(c)}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {communities && communities.length === 0 && <div className="empty-state">No communities found.</div>}
        </div>
      </div>

      {/* ── View Modal ── */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-box detail-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Community Details</h3>
              <button className="icon-btn" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <div className="detail-grid">
              <DetailItem label="Community Name" value={viewing.name} />
              <DetailItem label="Status" value={viewing.is_active ? 'Active' : 'Inactive'} />
              <DetailItem label="Address" value={viewing.address} full />
              <DetailItem label="Contact Phone" value={viewing.contact_phone} />
              <DetailItem label="Mobile Number" value={viewing.mobile_number} />
              <DetailItem label="Email" value={viewing.contact_email} />
              <DetailItem label="Logo URL" value={viewing.logo_url} />
              <DetailItem label="Created" value={viewing.created_at} />
              <DetailItem label="Updated" value={viewing.updated_at} />
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal-box" onClick={e => e.stopPropagation()} onSubmit={saveEdit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>Edit Community</h3>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            {error && <div className="banner banner-error">{error}</div>}
            <div className="field">
              <label>Community name</label>
              <input value={editing.name || ''} onChange={e => setEditing(f => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Address</label>
              <textarea rows={2} value={editing.address || ''} onChange={e => setEditing(f => ({ ...f, address: e.target.value }))} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>Contact phone</label>
                <input value={editing.contact_phone || ''} onChange={e => setEditing(f => ({ ...f, contact_phone: e.target.value }))} />
              </div>
              <div className="field">
                <label>Mobile number</label>
                <input value={editing.mobile_number || ''} onChange={e => setEditing(f => ({ ...f, mobile_number: e.target.value }))} />
              </div>
            </div>
            <div className="field">
              <label>Contact email</label>
              <input type="email" value={editing.contact_email || ''} onChange={e => setEditing(f => ({ ...f, contact_email: e.target.value }))} />
            </div>
            <div className="field">
              <label>Logo URL</label>
              <input value={editing.logo_url || ''} onChange={e => setEditing(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." />
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

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget && !deleteDeps}
        title="Delete Community"
        message="Are you sure you want to delete this Community?"
        variant="danger"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
      >
        {deleteError && <div className="banner banner-error" style={{ textAlign: 'left' }}>{deleteError}</div>}
      </ConfirmDialog>

      {/* ── Deps exist — offer deactivation ── */}
      <ConfirmDialog
        open={!!deleteDeps}
        title="Cannot Delete Community"
        message={deleteDeps?.error}
        variant="warning"
        confirmLabel="Deactivate Community"
        cancelLabel="Cancel"
        onConfirm={() => handleDeactivate(deleteTarget)}
        onCancel={() => { setDeleteTarget(null); setDeleteDeps(null); setDeleteError(''); }}
      >
        <div className="dep-info">
          <strong>Dependent records found:</strong>
          <ul>
            {deleteDeps?.dependencies?.blocks > 0 && <li>{deleteDeps.dependencies.blocks} block(s)</li>}
            {deleteDeps?.dependencies?.flats > 0 && <li>{deleteDeps.dependencies.flats} flat(s)</li>}
            {deleteDeps?.dependencies?.incidents > 0 && <li>{deleteDeps.dependencies.incidents} incident(s)</li>}
            {deleteDeps?.dependencies?.penalties > 0 && <li>{deleteDeps.dependencies.penalties} penalty(ies)</li>}
          </ul>
        </div>
        {deleteError && <div className="banner banner-error" style={{ textAlign: 'left' }}>{deleteError}</div>}
      </ConfirmDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BLOCKS TAB
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// FLATS TAB (Enhancements 15, 16, 19 — Edit perf fix, Delete, View)
// ══════════════════════════════════════════════════════════════════════════════

function FlatsTab({ highlightFlat }) {
  const [flats, setFlats] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ block_id: '', floor: '', flat_number: '', owner_name: '', resident_name: '', mobile_number: '', email: '', occupancy_status: 'Occupied' });
  const [editing, setEditing] = useState(null);
  const [editLoadingId, setEditLoadingId] = useState(null); // per-row loading (Enhancement 15 perf fix)
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');
  const [revealedMap, setRevealedMap] = useState({}); // { [flatId]: { mobile_number, email } }
  const [revealingId, setRevealingId] = useState(null);

  // View state
  const [viewing, setViewing] = useState(null);
  const [viewLoading, setViewLoading] = useState(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteDeps, setDeleteDeps] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const load = () => api.get('/masters/flats', { params: search ? { search } : {} }).then(res => setFlats(res.data));
  useEffect(() => { load(); }, [search]);
  useEffect(() => { api.get('/masters/blocks').then(res => setBlocks(res.data)); }, []);

  async function add(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/flats', form);
      setForm({ block_id: '', floor: '', flat_number: '', owner_name: '', resident_name: '', mobile_number: '', email: '', occupancy_status: 'Occupied' });
      setShowForm(false);
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  // Enhancement 15 perf fix: per-row loading indicator instead of global disabled state
  async function openEdit(flat) {
    setEditLoadingId(flat.id);
    setEditError('');
    try {
      const res = await api.get(`/masters/flats/${flat.id}`, { params: { unmask: true, reason: 'Editing flat record' } });
      setEditing(res.data);
    } catch (err) {
      setEditError(apiErrorMessage(err, 'Could not load this flat for editing'));
    } finally {
      setEditLoadingId(null);
    }
  }

  async function openView(flat) {
    setViewLoading(flat.id);
    try {
      const res = await api.get(`/masters/flats/${flat.id}`, { params: { unmask: true, reason: 'Viewing flat details' } });
      setViewing(res.data);
    } catch (err) {
      // Fallback to masked view
      setViewing(flat);
    } finally {
      setViewLoading(null);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    setEditError('');
    try {
      await api.put(`/masters/flats/${editing.id}`, editing);
      setEditing(null);
      load();
    } catch (err) { setEditError(apiErrorMessage(err)); }
  }

  async function handleDelete(flat) {
    setDeleteError('');
    setDeleteDeps(null);
    try {
      await api.delete(`/masters/flats/${flat.id}`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      if (err.response?.status === 409) {
        setDeleteDeps(err.response.data);
      } else {
        setDeleteError(apiErrorMessage(err));
      }
    }
  }

  async function handleDeactivate(flat) {
    try {
      await api.post(`/masters/flats/${flat.id}/deactivate`);
      setDeleteTarget(null);
      setDeleteDeps(null);
      load();
    } catch (err) { setDeleteError(apiErrorMessage(err)); }
  }

  async function toggleReveal(flat) {
    if (revealedMap[flat.id]) {
      setRevealedMap(m => { const n = { ...m }; delete n[flat.id]; return n; });
      return;
    }
    setRevealingId(flat.id);
    try {
      const res = await api.get(`/masters/flats/${flat.id}`, { params: { unmask: true, reason: 'Viewing contact in flats register' } });
      setRevealedMap(m => ({ ...m, [flat.id]: { mobile_number: res.data.mobile_number, email: res.data.email } }));
    } catch (err) {
      // stay masked on failure
    } finally {
      setRevealingId(null);
    }
  }

  return (
    <div>
      <div className="toolbar">
        <input type="text" placeholder="Search flat / resident / mobile" value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 260 }} />
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><Plus size={14} /> Add flat</button>
      </div>

      {editError && !editing && <div className="banner banner-error">{editError}</div>}

      {showForm && (
        <form className="card card-pad" onSubmit={add} style={{ marginBottom: 16 }}>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="field-row">
            <div className="field"><label>Block</label>
              <select value={form.block_id} onChange={e => setForm(f => ({ ...f, block_id: e.target.value }))} required>
                <option value="">Select block</option>
                {blocks.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Flat number</label>
              <input value={form.flat_number} onChange={e => setForm(f => ({ ...f, flat_number: e.target.value }))} required />
            </div>
          </div>
          <div className="field">
            <label>Floor <span className="text-muted" style={{ fontWeight: 400 }}>(optional — auto-fills Flat-level incident capture)</span></label>
            <input value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. 1, 2, Ground" />
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
            <thead><tr><th>Block</th><th>Floor</th><th>Flat</th><th>Resident</th><th>Mobile</th><th>Email</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {flats && flats.map(f => {
                const revealed = revealedMap[f.id];
                const isRowLoading = editLoadingId === f.id || viewLoading === f.id;
                return (
                  <tr key={f.id} className={isRowLoading ? 'row-loading' : ''} style={{ background: String(f.id) === highlightFlat ? 'var(--primary-tint)' : undefined }}>
                    <td>{f.block_name}</td><td>{f.floor || '—'}</td><td>{f.flat_number}</td><td>{f.resident_name || '—'}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{revealed ? (revealed.mobile_number || '—') : (f.mobile_number || '—')}</td>
                    <td className="mono" style={{ fontSize: 12 }}>{revealed ? (revealed.email || '—') : (f.email || '—')}</td>
                    <td>
                      <span className="chip">{f.is_active ? f.occupancy_status : 'Inactive'}</span>
                    </td>
                    <td>
                      <div className="action-icons">
                        <button className="icon-btn icon-btn-view" title="View flat details" onClick={() => openView(f)} disabled={isRowLoading}>
                          {viewLoading === f.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Eye size={15} />}
                        </button>
                        <button className="icon-btn icon-btn-edit" title="Edit flat" onClick={() => openEdit(f)} disabled={isRowLoading}>
                          {editLoadingId === f.id ? <span className="spinner" style={{ width: 13, height: 13 }} /> : <Pencil size={15} />}
                        </button>
                        <button className="icon-btn icon-btn-danger" title="Delete flat" onClick={() => setDeleteTarget(f)} disabled={isRowLoading}>
                          <Trash2 size={15} />
                        </button>
                        <button className="icon-btn" title={revealed ? 'Hide contact details' : 'Reveal contact details (logged to audit trail)'}
                          onClick={() => toggleReveal(f)} disabled={revealingId === f.id}>
                          {revealingId === f.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (revealed ? <EyeOff size={13} /> : <Eye size={13} />)}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {flats && flats.length === 0 && <div className="empty-state">No flats found.</div>}
        </div>
      </div>

      {/* ── View Modal ── */}
      {viewing && (
        <div className="modal-overlay" onClick={() => setViewing(null)}>
          <div className="modal-box detail-modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Flat {viewing.flat_number} — Details</h3>
              <button className="icon-btn" onClick={() => setViewing(null)}><X size={18} /></button>
            </div>
            <div className="detail-grid">
              <DetailItem label="Block" value={viewing.block_name} />
              <DetailItem label="Floor" value={viewing.floor} />
              <DetailItem label="Flat Number" value={viewing.flat_number} />
              <DetailItem label="Owner Name" value={viewing.owner_name} />
              <DetailItem label="Resident Name" value={viewing.resident_name} />
              <DetailItem label="Mobile Number" value={viewing.mobile_number} />
              <DetailItem label="Email" value={viewing.email} />
              <DetailItem label="Occupancy Status" value={viewing.occupancy_status} />
              <DetailItem label="Status" value={viewing.is_active ? 'Active' : 'Inactive'} />
              <DetailItem label="Created" value={viewing.created_at} />
            </div>
            <p className="field-hint" style={{ marginTop: 14 }}>Contact details shown above are the real, unmasked values — this view is logged to the audit trail.</p>
          </div>
        </div>
      )}

      {/* ── Edit Modal (Enhancement 15 — with full fields + validation) ── */}
      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <form className="modal-box" onClick={e => e.stopPropagation()} onSubmit={saveEdit}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>Edit Flat {editing.flat_number}</h3>
              <button type="button" className="icon-btn" onClick={() => setEditing(null)}><X size={18} /></button>
            </div>
            {editError && <div className="banner banner-error">{editError}</div>}
            <div className="field-row">
              <div className="field">
                <label>Block</label>
                <select value={editing.block_id} onChange={e => setEditing(f => ({ ...f, block_id: Number(e.target.value) }))} required>
                  {blocks.map(b => <option key={b.id} value={b.id}>{b.name}{!b.is_active ? ' (Inactive)' : ''}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Flat number</label>
                <input value={editing.flat_number || ''} onChange={e => setEditing(f => ({ ...f, flat_number: e.target.value }))} required />
              </div>
            </div>
            <div className="field">
              <label>Floor</label>
              <input value={editing.floor || ''} onChange={e => setEditing(f => ({ ...f, floor: e.target.value }))} placeholder="e.g. 1, 2, Ground" />
            </div>
            <div className="field-row">
              <div className="field"><label>Owner name</label><input value={editing.owner_name || ''} onChange={e => setEditing(f => ({ ...f, owner_name: e.target.value }))} /></div>
              <div className="field"><label>Resident name</label><input value={editing.resident_name || ''} onChange={e => setEditing(f => ({ ...f, resident_name: e.target.value }))} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Mobile</label><input value={editing.mobile_number || ''} onChange={e => setEditing(f => ({ ...f, mobile_number: e.target.value }))} /></div>
              <div className="field"><label>Email</label><input type="email" value={editing.email || ''} onChange={e => setEditing(f => ({ ...f, email: e.target.value }))} /></div>
            </div>
            <p className="field-hint" style={{ marginTop: -8 }}>These are the real, unmasked values — visible here because opening this form is logged to the audit trail.</p>
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

      {/* ── Delete Confirm ── */}
      <ConfirmDialog
        open={!!deleteTarget && !deleteDeps}
        title="Delete Flat"
        message={deleteTarget ? `Are you sure you want to delete Flat ${deleteTarget.flat_number}?` : ''}
        variant="danger"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
      >
        {deleteError && <div className="banner banner-error" style={{ textAlign: 'left' }}>{deleteError}</div>}
      </ConfirmDialog>

      {/* ── Deps exist — offer deactivation ── */}
      <ConfirmDialog
        open={!!deleteDeps}
        title="Cannot Delete Flat"
        message={deleteDeps?.error}
        variant="warning"
        confirmLabel="Deactivate Flat"
        cancelLabel="Cancel"
        onConfirm={() => handleDeactivate(deleteTarget)}
        onCancel={() => { setDeleteTarget(null); setDeleteDeps(null); setDeleteError(''); }}
      >
        <div className="dep-info">
          <strong>Transaction history found:</strong>
          <ul>
            {deleteDeps?.dependencies?.incidents > 0 && <li>{deleteDeps.dependencies.incidents} incident(s)</li>}
            {deleteDeps?.dependencies?.warnings > 0 && <li>{deleteDeps.dependencies.warnings} warning(s)</li>}
            {deleteDeps?.dependencies?.penalties > 0 && <li>{deleteDeps.dependencies.penalties} penalty(ies)</li>}
            {deleteDeps?.dependencies?.communications > 0 && <li>{deleteDeps.dependencies.communications} communication(s)</li>}
          </ul>
        </div>
        {deleteError && <div className="banner banner-error" style={{ textAlign: 'left' }}>{deleteError}</div>}
      </ConfirmDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Shared detail item component
// ══════════════════════════════════════════════════════════════════════════════

function DetailItem({ label, value, full }) {
  return (
    <div className={`detail-item${full ? ' full-width' : ''}`}>
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value || '—'}</span>
    </div>
  );
}
