import { useEffect, useState } from 'react';
import { Database, Search, ArrowRight, Play, Check } from 'lucide-react';
import { api, apiErrorMessage } from '../api';

export default function DbExplorer() {
  const [tables, setTables] = useState([]);
  const [selectedTable, setSelectedTable] = useState('');
  const [schema, setSchema] = useState([]);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Custom SQL console state
  const [customSql, setCustomSql] = useState('');
  const [queryResult, setQueryResult] = useState(null);
  const [queryError, setQueryError] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  useEffect(() => {
    // Get all database tables
    api.get('/db-explorer/tables')
      .then(res => {
        setTables(res.data);
        if (res.data.length > 0) {
          setSelectedTable(res.data[0]);
        }
      })
      .catch(err => setError(apiErrorMessage(err, 'Failed to fetch database tables')));
  }, []);

  useEffect(() => {
    if (!selectedTable) return;
    setLoading(true);
    setError('');
    api.get(`/db-explorer/tables/${selectedTable}`)
      .then(res => {
        setSchema(res.data.columns);
        setRows(res.data.rows);
      })
      .catch(err => setError(apiErrorMessage(err, 'Failed to fetch table records')))
      .finally(() => setLoading(false));
  }, [selectedTable]);

  function runCustomQuery(e) {
    e.preventDefault();
    if (!customSql.trim()) return;
    setQueryLoading(true);
    setQueryError('');
    setQueryResult(null);

    api.post('/db-explorer/query', { sql: customSql })
      .then(res => {
        setQueryResult(res.data);
      })
      .catch(err => setQueryError(apiErrorMessage(err, 'Query execution failed')))
      .finally(() => setQueryLoading(false));
  }

  return (
    <div style={{ maxWidth: '100%' }}>
      <div className="page-header">
        <div>
          <div className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Database size={14} /> Database Console
          </div>
          <h1>System Data Explorer</h1>
          <p className="desc">Secure, live database browser for administrators. Browse system tables or run custom select queries.</p>
        </div>
      </div>

      {error && <div className="banner banner-error" style={{ marginBottom: 20 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>
        
        {/* Left column: Tables list */}
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Tables</h3>
          <div style={{ display: 'flex', flexDirection: 'col', gap: 6 }}>
            {tables.map(t => (
              <button
                key={t}
                onClick={() => setSelectedTable(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: selectedTable === t ? 600 : 400,
                  backgroundColor: selectedTable === t ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
                  color: selectedTable === t ? 'var(--primary, #0284c7)' : 'var(--ink-soft)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>{t}</span>
                {selectedTable === t && <ArrowRight size={14} />}
              </button>
            ))}
          </div>
        </div>

        {/* Right column: Table viewer & SQL console */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          
          {/* Table Data Viewer Card */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 16, color: 'var(--ink)' }}>Table: {selectedTable || '—'}</strong>
                <span className="chip">{rows.length} rows</span>
              </div>
            </div>

            {loading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink-soft)' }}>
                <span className="spinner" style={{ marginRight: 8 }} /> Loading records...
              </div>
            ) : (
              <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      {schema.map(col => (
                        <th key={col.name} style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span>{col.name}</span>
                            <span style={{ fontSize: 9, color: 'var(--ink-soft)', fontWeight: 400 }}>{col.type || 'TEXT'} {col.pk ? '🔑' : ''}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => (
                      <tr key={idx}>
                        {schema.map(col => {
                          const val = row[col.name];
                          return (
                            <td key={col.name} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {val === null ? <em style={{ color: 'var(--ink-soft)' }}>null</em> : String(val)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length === 0 && (
                  <div className="empty-state" style={{ padding: 40 }}>This table contains no records.</div>
                )}
              </div>
            )}
          </div>

          {/* Interactive SQL Console Card */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
              <Play size={16} color="var(--primary)" /> SQL Query Console
            </h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 12, color: 'var(--ink-soft)' }}>
              Type and run custom <code>SELECT</code> queries against your live SQLite database. Modifications are blocked for safety.
            </p>

            <form onSubmit={runCustomQuery} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <textarea
                value={customSql}
                onChange={e => setCustomSql(e.target.value)}
                placeholder="SELECT * FROM incidents WHERE status = 'Approved' ORDER BY created_at DESC LIMIT 5;"
                rows={3}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  padding: 12,
                  borderRadius: 6,
                  border: '1px solid var(--line)',
                  backgroundColor: '#fafafa',
                  outline: 'none',
                  resize: 'vertical'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={queryLoading || !customSql.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  {queryLoading ? <span className="spinner" /> : <Play size={14} />} Run Query
                </button>
              </div>
            </form>

            {queryError && (
              <div className="banner banner-error" style={{ marginTop: 16 }}>{queryError}</div>
            )}

            {queryResult && (
              <div style={{ marginTop: 20, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Check size={16} color="#10b981" />
                  <strong>Query Results</strong>
                  <span className="chip">{queryResult.rows.length} rows returned</span>
                </div>

                <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        {queryResult.columns.map(col => (
                          <th key={col.name}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {queryResult.rows.map((row, idx) => (
                        <tr key={idx}>
                          {queryResult.columns.map(col => {
                            const val = row[col.name];
                            return (
                              <td key={col.name} style={{ fontFamily: 'monospace', fontSize: 12 }}>
                                {val === null ? <em style={{ color: 'var(--ink-soft)' }}>null</em> : String(val)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {queryResult.rows.length === 0 && (
                    <div className="empty-state">No matching rows returned.</div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
