import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Image as ImageIcon, X } from 'lucide-react';
import { api, apiErrorMessage } from '../api';

export default function IncidentCapture() {
  const navigate = useNavigate();
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    block_id: '', flat_id: '', category_id: '',
    incident_date: new Date().toISOString().slice(0, 10),
    incident_time: new Date().toTimeString().slice(0, 5),
    remarks: '', gps_lat: '', gps_lng: '',
  });
  const [photos, setPhotos] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);

  useEffect(() => {
    api.get('/masters/blocks').then(res => setBlocks(res.data));
    api.get('/masters/categories').then(res => setCategories(res.data.filter(c => c.is_active)));
  }, []);

  useEffect(() => {
    if (!form.block_id) { setFlats([]); return; }
    api.get('/masters/flats', { params: { block_id: form.block_id } }).then(res => setFlats(res.data));
  }, [form.block_id]);

  function useGps() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setForm(f => ({ ...f, gps_lat: pos.coords.latitude.toFixed(6), gps_lng: pos.coords.longitude.toFixed(6) })),
      () => {}
    );
  }

  function addPhotos(fileList) {
    const files = Array.from(fileList).slice(0, 8 - photos.length);
    const withPreviews = files.map(file => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos(p => [...p, ...withPreviews].slice(0, 8));
  }

  function removePhoto(idx) {
    setPhotos(p => p.filter((_, i) => i !== idx));
  }

  const selectedFlat = flats.find(f => String(f.id) === String(form.flat_id));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.flat_id || !form.category_id || !form.incident_date) {
      setError('Please select a flat, a violation category, and the incident date.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v !== '') fd.append(k, v); });
      photos.forEach(p => fd.append('photos', p.file));
      const res = await api.post('/incidents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      navigate(`/incidents/${res.data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save this incident'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">New Record</div>
          <h1>Capture waste disposal incident</h1>
          <p className="desc">Attach clear photos as evidence. The incident enters the approval queue and only affects warnings or penalties once a supervisor signs off.</p>
        </div>
      </div>

      <div className="grid-2">
        <form className="card card-pad" onSubmit={submit}>
          {error && <div className="banner banner-error">{error}</div>}

          <div className="field-row">
            <div className="field">
              <label>Block</label>
              <select value={form.block_id} onChange={e => setForm(f => ({ ...f, block_id: e.target.value, flat_id: '' }))} required>
                <option value="">Select block</option>
                {blocks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Flat number</label>
              <select value={form.flat_id} onChange={e => setForm(f => ({ ...f, flat_id: e.target.value }))} required disabled={!form.block_id}>
                <option value="">Select flat</option>
                {flats.map(f => <option key={f.id} value={f.id}>{f.flat_number}</option>)}
              </select>
            </div>
          </div>

          {selectedFlat && (
            <div className="field-hint" style={{ marginTop: -8, marginBottom: 14 }}>
              Resident: <b>{selectedFlat.resident_name || 'Not on file'}</b> · {selectedFlat.mobile_number || 'No mobile on file'}
            </div>
          )}

          <div className="field">
            <label>Violation category</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} required>
              <option value="">Select category</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} required />
            </div>
            <div className="field">
              <label>Time</label>
              <input type="time" value={form.incident_time} onChange={e => setForm(f => ({ ...f, incident_time: e.target.value }))} />
            </div>
          </div>

          <div className="field">
            <label>GPS location (optional)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="text" readOnly placeholder="Not captured"
                value={form.gps_lat ? `${form.gps_lat}, ${form.gps_lng}` : ''} />
              <button type="button" className="btn btn-outline btn-sm" onClick={useGps}>Use current location</button>
            </div>
          </div>

          <div className="field">
            <label>Remarks</label>
            <textarea rows={3} value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
              placeholder="Describe what was observed…" />
          </div>

          <button className="btn btn-primary" disabled={submitting} style={{ marginTop: 6 }}>
            {submitting ? <span className="spinner" /> : 'Submit for approval'}
          </button>
        </form>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Photographic evidence</h3>
          <p className="field-hint" style={{ marginBottom: 14 }}>Up to 8 photos. Images are compressed automatically on upload.</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button type="button" className="btn btn-outline" onClick={() => cameraInput.current.click()} disabled={photos.length >= 8}>
              <Camera size={15} /> Camera
            </button>
            <button type="button" className="btn btn-outline" onClick={() => galleryInput.current.click()} disabled={photos.length >= 8}>
              <ImageIcon size={15} /> Gallery
            </button>
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden multiple
              onChange={e => addPhotos(e.target.files)} />
            <input ref={galleryInput} type="file" accept="image/*" hidden multiple
              onChange={e => addPhotos(e.target.files)} />
          </div>

          {photos.length === 0 ? (
            <div className="empty-state">No photos attached yet.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {photos.map((p, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <img src={p.preview} className="photo-thumb" alt="" />
                  <button type="button" onClick={() => removePhoto(idx)}
                    style={{ position: 'absolute', top: -6, right: -6, background: 'var(--penalty)', color: '#fff', border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
