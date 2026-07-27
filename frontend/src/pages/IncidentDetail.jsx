import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin, Eye, EyeOff, X, ZoomIn } from 'lucide-react';
import { api, photoUrl, apiErrorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge, { LevelBadge } from '../components/StatusBadge';

function locationSummary(incident) {
  switch (incident.incident_level) {
    case 'Community': return 'Community-wide';
    case 'Block': return incident.block_name;
    case 'Floor': return `${incident.block_name} · Floor ${incident.floor}`;
    case 'Flat':
    default: return `Flat ${incident.flat_number}, ${incident.block_name}`;
  }
}

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [revealing, setRevealing] = useState(false);

  const load = () => api.get(`/incidents/${id}`).then(res => setIncident(res.data));
  useEffect(() => { load(); setRevealed(null); }, [id]);

  const canDecide = (user.role === 'Administrator' || user.role === 'Supervisor')
    && incident && incident.status === 'Pending Approval';
  const isFlatLevel = incident && incident.incident_level === 'Flat';

  async function decide(decision) {
    setError('');
    setBusy(true);
    try {
      await api.post(`/incidents/${id}/decision`, { decision, remarks });
      await load();
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not record this decision'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleReveal() {
    if (revealed) { setRevealed(null); return; }
    setRevealing(true);
    try {
      const res = await api.get(`/incidents/${id}`, { params: { unmask: true } });
      setRevealed({ mobile_number: res.data.mobile_number, email: res.data.email });
    } catch (err) {
      // leave masked on failure
    } finally {
      setRevealing(false);
    }
  }

  if (!incident) return <div className="empty-state">Loading…</div>;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate(-1)} style={{ marginBottom: 10 }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div className="page-header">
        <div>
          <div className="eyebrow mono">{incident.incident_number}</div>
          <h1>{incident.category_name}</h1>
          <p className="desc">{locationSummary(incident)} · {incident.incident_date} {incident.incident_time || ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <LevelBadge level={incident.incident_level} />
          <StatusBadge status={incident.status} />
          {incident.resolution && <StatusBadge status={incident.resolution} />}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Details</h3>
          <DetailRow label="Level" value={<LevelBadge level={incident.incident_level} />} />
          {incident.block_name && <DetailRow label="Block" value={incident.block_name} />}
          {incident.floor && <DetailRow label="Floor" value={incident.floor} />}
          {incident.flat_number && <DetailRow label="Flat" value={incident.flat_number} />}
          {isFlatLevel && (
            <>
              <DetailRow label="Resident" value={incident.resident_name || 'Not on file'} />
              <DetailRow
                label="Contact"
                value={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className="mono" style={{ fontSize: 12.5 }}>
                      {revealed ? `${revealed.mobile_number || '—'} · ${revealed.email || '—'}` : `${incident.mobile_number || '—'} · ${incident.email || '—'}`}
                    </span>
                    {user.role === 'Administrator' && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 2 }}
                        title={revealed ? 'Hide contact details' : 'Reveal contact details (logged to audit trail)'}
                        onClick={toggleReveal} disabled={revealing}>
                        {revealing ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (revealed ? <EyeOff size={13} /> : <Eye size={13} />)}
                      </button>
                    )}
                  </span>
                }
              />
            </>
          )}
          <DetailRow label="Captured by" value={incident.maker_name} />
          <DetailRow label={isFlatLevel ? 'Maker remarks' : 'Description'} value={incident.remarks || '—'} />
          {incident.gps_lat && (
            <DetailRow label="GPS" value={<span><MapPin size={12} style={{ verticalAlign: -2 }} /> {incident.gps_lat}, {incident.gps_lng}</span>} />
          )}
          {incident.status !== 'Pending Approval' && (
            <>
              <div style={{ borderTop: '1px solid var(--line)', margin: '14px 0' }} />
              <DetailRow label="Decided by" value={incident.supervisor_name || '—'} />
              <DetailRow label="Decided at" value={incident.decided_at || '—'} />
              <DetailRow label="Supervisor remarks" value={incident.supervisor_remarks || '—'} />
            </>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Photographic evidence ({incident.photos.length})</h3>
          {incident.photos.length === 0 ? (
            <div className="empty-state">No photos were attached.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {incident.photos.map(p => (
                <div
                  key={p.id}
                  style={{ position: 'relative', cursor: 'pointer', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}
                  onClick={() => setLightbox(p)}
                >
                  <img src={photoUrl(p.thumb_path)} className="photo-thumb" alt="" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canDecide && (
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Supervisor decision</h3>
          {error && <div className="banner banner-error">{error}</div>}
          <div className="field">
            <label>Remarks (optional)</label>
            <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add context for this decision…" />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => decide('Approved')}>Approve</button>
            <button className="btn btn-danger" disabled={busy} onClick={() => decide('Rejected')}>Reject</button>
            <button className="btn btn-outline" disabled={busy} onClick={() => decide('Condoned')}>Condone</button>
          </div>
          <p className="field-hint" style={{ marginTop: 10 }}>
            {isFlatLevel
              ? "Approving checks this flat's prior approved history for this category and automatically issues a warning or a penalty per the configured rule."
              : `${incident.incident_level}-level incidents follow the same approval workflow, but — as they aren't tied to a single resident — approving one does not generate a warning or penalty.`}
          </p>
        </div>
      )}

      {lightbox && (
        <div
          className="modal-overlay"
          style={{ background: 'rgba(15, 23, 18, 0.82)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 100 }}
          onClick={() => setLightbox(null)}
        >
          <div
            style={{
              position: 'relative',
              background: '#16241C',
              borderRadius: 14,
              padding: 12,
              maxWidth: '90vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              border: '1px solid rgba(255,255,255,0.15)',
              overflow: 'hidden',
              animation: 'popIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', padding: '4px 8px 10px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span style={{ color: '#DCE7DF', fontSize: 13, fontWeight: 500, fontFamily: 'var(--font-mono)' }}>
                {lightbox.original_name || incident.incident_number}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ color: '#fff', padding: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyControl: 'center' }}
                onClick={() => setLightbox(null)}
                title="Close image"
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', borderRadius: 8 }}>
              <img
                src={photoUrl(lightbox.file_path || lightbox.thumb_path)}
                alt=""
                style={{ maxWidth: '85vw', maxHeight: '75vh', objectFit: 'contain', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '6px 0' }}>
      <span className="text-muted">{label}</span>
      <span style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}
