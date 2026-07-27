import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, ClipboardList, CheckSquare, Building2, Tags, Users,
  FileBarChart, UploadCloud, ScrollText, LogOut, Search, Bell, Trash2, Menu, X
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
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const boxRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    api.get('/dashboard/notifications').then(res => {
      setNotifications(res.data || []);
      const p = res.data.find(n => n.type === 'Pending Approval');
      setPendingCount(p ? p.count : 0);
    }).catch(() => {});
  }, [location.pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  useEffect(() => {
    function onClick(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setShowResults(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
    }
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
      {/* Mobile backdrop */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
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
        <div className="sidebar-footer">
          <button className="nav-link" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="main-area">
        <div className="topbar">
          {/* Hamburger — visible only on mobile via CSS */}
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(p => !p)} aria-label="Toggle menu">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

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
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 6, position: 'relative', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => setShowNotifications(p => !p)}
                title="Notifications"
              >
                <Bell size={17} color="var(--ink-soft)" />
                {notifications.length > 0 && (
                  <span style={{ position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--penalty)' }} />
                )}
              </button>
              {showNotifications && (
                <div className="card" style={{ position: 'absolute', top: 38, right: 0, width: 280, zIndex: 30, padding: '10px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
                    Notifications
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 0' }}>No active notifications.</div>
                  ) : (
                    notifications.map((n, idx) => (
                      <div
                        key={idx}
                        style={{ padding: '8px 6px', cursor: 'pointer', borderRadius: 6, fontSize: 12.5, transition: 'background 0.15s' }}
                        className="nav-link"
                        onClick={() => {
                          setShowNotifications(false);
                          if (n.type === 'Pending Approval') navigate('/approvals');
                          else if (n.type === 'Unpaid Penalty') navigate('/reports');
                        }}
                      >
                        <b>{n.type}:</b> {n.message}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="user-chip">
              <div className="avatar">{initials(user.name)}</div>
              <div>
                <div className="user-name">{user.name}</div>
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
