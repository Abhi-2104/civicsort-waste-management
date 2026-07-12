import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { api, photoUrl, apiErrorMessage } from '../api';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [incident, setIncident] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.get(`/incidents/${id}`).then(res => setIncident(res.data));
  useEffect(() => { load(); }, [id]);

  const canDecide = (user.role === 'Administrator' || user.role === 'Supervisor')
    && incident && incident.status === 'Pending Approval';

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
          <p className="desc">Flat {incident.flat_number}, {incident.block_name} · {incident.incident_date} {incident.incident_time || ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <StatusBadge status={incident.status} />
          {incident.resolution && <StatusBadge status={incident.resolution} />}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 12 }}>Details</h3>
          <DetailRow label="Resident" value={incident.resident_name || 'Not on file'} />
          <DetailRow label="Contact" value={`${incident.mobile_number || '—'} · ${incident.email || '—'}`} />
          <DetailRow label="Captured by" value={incident.maker_name} />
          <DetailRow label="Maker remarks" value={incident.remarks || '—'} />
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {incident.photos.map(p => (
                <img key={p.id} src={photoUrl(p.thumb_path)} className="photo-thumb" alt=""
                  onClick={() => setLightbox(photoUrl(p.file_path))} />
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
            Approving checks this flat's prior approved history for this category and automatically issues a warning or a penalty per the configured rule.
          </p>
        </div>
      )}

      {lightbox && (
        <div className="modal-overlay" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10 }} />
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
