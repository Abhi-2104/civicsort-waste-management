import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { api, apiErrorMessage } from '../api';

export default function Categories() {
  const [categories, setCategories] = useState(null);
  const [rules, setRules] = useState(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [catForm, setCatForm] = useState({ name: '', description: '' });
  const [ruleForm, setRuleForm] = useState({ category_id: '', warnings_before_penalty: 1, penalty_amount: '', effective_date: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState('');

  const load = () => {
    api.get('/masters/categories').then(res => setCategories(res.data));
    api.get('/masters/penalty-rules').then(res => setRules(res.data));
  };
  useEffect(() => { load(); }, []);

  async function addCategory(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/categories', catForm);
      setCatForm({ name: '', description: '' });
      setShowCatForm(false);
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function toggleCategory(c) {
    await api.put(`/masters/categories/${c.id}`, { ...c, is_active: c.is_active ? 0 : 1 });
    load();
  }

  async function addRule(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/masters/penalty-rules', ruleForm);
      setRuleForm({ category_id: '', warnings_before_penalty: 1, penalty_amount: '', effective_date: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err) { setError(apiErrorMessage(err)); }
  }

  async function toggleRule(r) {
    await api.put(`/masters/penalty-rules/${r.id}`, { ...r, is_active: r.is_active ? 0 : 1 });
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Configuration</div>
          <h1>Violation Categories &amp; Penalty Rules</h1>
          <p className="desc">Define what counts as a violation, and how many warnings are allowed before a penalty is automatically levied.</p>
        </div>
      </div>

      <div className="grid-2">
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Violation categories</h3>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Category</th><th>Description</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {categories && categories.map(c => (
                    <tr key={c.id}>
                      <td>{c.name}</td><td style={{ maxWidth: 260 }}>{c.description || '—'}</td>
                      <td><span className="chip">{c.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => toggleCategory(c)}>{c.is_active ? 'Disable' : 'Enable'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!showCatForm ? (
            <button className="btn btn-outline" onClick={() => setShowCatForm(true)}><Plus size={14} /> New category</button>
          ) : (
            <form className="card card-pad" onSubmit={addCategory}>
              {error && <div className="banner banner-error">{error}</div>}
              <div className="field"><label>Category name</label><input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} required /></div>
              <div className="field"><label>Description</label><textarea rows={2} value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary">Save category</button>
                <button type="button" className="btn btn-outline" onClick={() => setShowCatForm(false)}>Cancel</button>
              </div>
            </form>
          )}
        </div>

        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Penalty rules</h3>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Category</th><th>Warnings before penalty</th><th>Penalty ₹</th><th>Effective</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {rules && rules.map(r => (
                    <tr key={r.id}>
                      <td>{r.category_name}</td>
                      <td className="num">{r.warnings_before_penalty}</td>
                      <td className="num">₹{r.penalty_amount}</td>
                      <td>{r.effective_date}</td>
                      <td><span className="chip">{r.is_active ? 'Active' : 'Disabled'}</span></td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => toggleRule(r)}>{r.is_active ? 'Disable' : 'Enable'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rules && rules.length === 0 && <div className="empty-state">No penalty rules configured yet.</div>}
            </div>
          </div>

          <form className="card card-pad" onSubmit={addRule}>
            <h4 style={{ fontSize: 13, marginBottom: 10 }}>Add / update rule for a category</h4>
            <div className="field">
              <label>Category</label>
              <select value={ruleForm.category_id} onChange={e => setRuleForm(f => ({ ...f, category_id: e.target.value }))} required>
                <option value="">Select category</option>
                {categories && categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label>Warnings before penalty</label>
                <input type="number" min="0" value={ruleForm.warnings_before_penalty}
                  onChange={e => setRuleForm(f => ({ ...f, warnings_before_penalty: e.target.value }))} required />
              </div>
              <div className="field"><label>Penalty amount (₹)</label>
                <input type="number" min="0" step="1" value={ruleForm.penalty_amount}
                  onChange={e => setRuleForm(f => ({ ...f, penalty_amount: e.target.value }))} required />
              </div>
            </div>
            <div className="field"><label>Effective date</label>
              <input type="date" value={ruleForm.effective_date} onChange={e => setRuleForm(f => ({ ...f, effective_date: e.target.value }))} required />
            </div>
            <button className="btn btn-primary">Save rule</button>
            <p className="field-hint" style={{ marginTop: 8 }}>Adding a rule for a category that already has one creates a new effective-dated version; the most recent active rule is applied.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
