import { useState, useRef } from 'react';
import { Download, UploadCloud } from 'lucide-react';
import { api, apiErrorMessage, API_BASE } from '../api';

export default function ResidentUpload() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef(null);

  function downloadTemplate() {
    const token = localStorage.getItem('token');
    fetch(`${API_BASE}/api/upload/residents/template`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob()).then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'resident_upload_template.csv'; a.click();
        URL.revokeObjectURL(url);
      });
  }

  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setError(''); setResult(null); setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload/residents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not process this file'));
    } finally {
      setBusy(false);
      fileInput.current.value = '';
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Bulk Resident Upload</h1>
          <p className="desc">Upload a CSV to register many flats at once. Duplicate flats and missing mobile/email are flagged and skipped, everything else is imported.</p>
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>1. Get the template</h3>
          <p className="field-hint" style={{ marginBottom: 14 }}>
            Columns: Block, FlatNumber, OwnerName, ResidentName, MobileNumber, Email, OccupancyStatus. The block name must already exist.
          </p>
          <button className="btn btn-outline" onClick={downloadTemplate}><Download size={14} /> Download CSV template</button>

          <h3 style={{ fontSize: 14, margin: '22px 0 10px' }}>2. Upload your file</h3>
          <button className="btn btn-primary" onClick={() => fileInput.current.click()} disabled={busy}>
            <UploadCloud size={14} /> {busy ? 'Processing…' : 'Choose CSV file'}
          </button>
          <input ref={fileInput} type="file" accept=".csv" hidden onChange={upload} />
          {error && <div className="banner banner-error" style={{ marginTop: 14 }}>{error}</div>}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Upload report</h3>
          {!result ? (
            <div className="empty-state">Results will appear here after you upload a file.</div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                <div className="stat-card accent-primary" style={{ flex: 1 }}>
                  <div className="label">Successful</div><div className="value">{result.successful}</div>
                </div>
                <div className="stat-card accent-penalty" style={{ flex: 1 }}>
                  <div className="label">Rejected</div><div className="value">{result.rejected}</div>
                </div>
              </div>
              {result.details.length > 0 && (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Row</th><th>Flat</th><th>Reason</th></tr></thead>
                    <tbody>
                      {result.details.map((d, i) => (
                        <tr key={i}><td className="num">{d.row}</td><td>{d.flatNumber || '—'}</td><td>{d.reason}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
