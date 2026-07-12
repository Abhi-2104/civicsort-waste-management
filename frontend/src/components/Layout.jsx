import { NavLink, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, ClipboardList, CheckSquare, Building2, Tags, Users,
  FileBarChart, UploadCloud, ScrollText, LogOut, Search, Bell, Trash2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';

const NAV = [
  { section: 'Operations', items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['Administrator', 'Maker', 'Supervisor'] },
    { to: '/incidents', label: 'Incidents', icon: ClipboardList, roles: ['Administrator', 'Maker', 'Supervisor'] },
    { to: '/approvals', label: 'Approvals', icon: CheckSquare, roles: ['Administrator', 'Supervisor'], notifyKey: 'pending' },
  ]},
  { section: 'Configuration', items: [
    { to: '/masters', label: 'Community & Flats', icon: Building2, roles: ['Administrator'] },
    { to: '/categories', label: 'Categories & Rules', icon: Tags, roles: ['Administrator'] },
    { to: '/users', label: 'Users', icon: Users, roles: ['Administrator'] },
    { to: '/upload', label: 'Bulk Resident Upload', icon: UploadCloud, roles: ['Administrator'] },
  ]},
  { section: 'Insights', items: [
    { to: '/reports', label: 'Reports', icon: FileBarChart, roles: ['Administrator', 'Supervisor'] },
    { to: '/audit', label: 'Audit Trail', icon: ScrollText, roles: ['Administrator'] },
  ]},
];

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    api.get('/dashboard/notifications').then(res => {
      const p = res.data.find(n => n.type === 'Pending Approval');
      setPendingCount(p ? p.count : 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function onClick(e) { if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (query.length < 2) { setResults(null); return; }
    const t = setTimeout(() => {
      api.get('/dashboard/search', { params: { q: query } }).then(res => {
        setResults(res.data);
        setShowResults(true);
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="mark"><Trash2 size={16} /></div>
          <div>
            <div className="name">CivicSort</div>
            <div className="sub">Compliance Console</div>
          </div>
        </div>
        {NAV.map(section => {
          const visibleItems = section.items.filter(i => i.roles.includes(user.role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={section.section}>
              <div className="nav-section-label">{section.section}</div>
              {visibleItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'}
                  className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
                  <item.icon size={16} />
                  {item.label}
                  {item.notifyKey === 'pending' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <button className="nav-link" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          <div className="search-box" ref={boxRef} style={{ position: 'relative' }}>
            <Search size={15} color="var(--ink-soft)" />
            <input
              placeholder="Search flat, incident #, penalty #..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => results && setShowResults(true)}
            />
            {showResults && results && (
              <div className="card" style={{ position: 'absolute', top: 40, left: 0, right: 0, zIndex: 20, padding: 8, maxHeight: 320, overflowY: 'auto' }}>
                {results.flats.length === 0 && results.incidents.length === 0 && results.penalties.length === 0 && (
                  <div style={{ padding: 10, fontSize: 12.5, color: 'var(--ink-soft)' }}>No matches found.</div>
                )}
                {results.flats.map(f => (
                  <div key={'f' + f.id} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => { navigate(`/masters?flat=${f.id}`); setShowResults(false); setQuery(''); }}>
                    <b>Flat {f.flat_number}</b> — {f.resident_name || 'Unassigned'} <span className="text-muted">({f.mobile_number})</span>
                  </div>
                ))}
                {results.incidents.map(i => (
                  <div key={'i' + i.id} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => { navigate(`/incidents/${i.id}`); setShowResults(false); setQuery(''); }}>
                    <span className="mono">{i.incident_number}</span> — {i.status}
                  </div>
                ))}
                {results.penalties.map(p => (
                  <div key={'p' + p.id} style={{ padding: '8px 10px', cursor: 'pointer', fontSize: 13 }}
                    onClick={() => { navigate('/reports'); setShowResults(false); setQuery(''); }}>
                    <span className="mono">{p.penalty_number}</span> — ₹{p.penalty_amount} ({p.status})
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ position: 'relative' }}>
              <Bell size={17} color="var(--ink-soft)" />
              {pendingCount > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--penalty)' }} />
              )}
            </div>
            <div className="user-chip">
              <div className="avatar">{initials(user.name)}</div>
              <div>
                <div>{user.name}</div>
                <div className="role-pill">{user.role}</div>
              </div>
            </div>
          </div>
        </div>
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
