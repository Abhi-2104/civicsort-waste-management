import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const PIE_COLORS = ['#2C6B4A', '#B9822B', '#A93B33', '#2C5B6B', '#6C7F72'];

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/dashboard/summary').then(res => setData(res.data));
  }, []);

  if (!data) return <div className="empty-state">Loading dashboard…</div>;

  const { counts, penaltyStats, blockWise, monthly, topBlocks, topCategories } = data;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Overview</div>
          <h1>Good to see you, {user.name.split(' ')[0]}</h1>
          <p className="desc">Live snapshot of waste-disposal compliance across every block, updated as incidents are logged and approved.</p>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Total incidents" value={counts.total_incidents} />
        <Stat label="Pending approval" value={counts.pending} accent="warn" />
        <Stat label="Warnings issued" value={counts.warnings} accent="warn" />
        <Stat label="Penalties levied" value={counts.penalties} accent="penalty" />
        <Stat label="Penalty outstanding" value={`₹${penaltyStats.outstanding.toLocaleString('en-IN')}`} accent="penalty" />
        <Stat label="Penalty collected" value={`₹${penaltyStats.collected.toLocaleString('en-IN')}`} accent="primary" />
      </div>

      <div className="grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Incidents by month</h3>
          {monthly.length === 0 ? <div className="empty-state">No incidents recorded yet.</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[...monthly].reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E7DC" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="#8B9A90" />
                <YAxis tick={{ fontSize: 11 }} stroke="#8B9A90" allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#2C6B4A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Top violation categories</h3>
          {topCategories.length === 0 ? <div className="empty-state">No data yet.</div> : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={topCategories} dataKey="count" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={{ fontSize: 11 }}>
                  {topCategories.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Block-wise incident volume</h3>
          {blockWise.every(b => b.incidents === 0) ? <div className="empty-state">No incidents recorded yet.</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={blockWise} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E9E7DC" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#8B9A90" allowDecimals={false} />
                <YAxis type="category" dataKey="block" tick={{ fontSize: 12 }} stroke="#8B9A90" width={70} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="incidents" fill="#B9822B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Top violating blocks</h3>
          <table className="data-table">
            <thead><tr><th>Block</th><th>Incidents</th></tr></thead>
            <tbody>
              {topBlocks.map(b => (
                <tr key={b.block}><td>{b.block}</td><td className="num">{b.incidents}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat-card${accent ? ' accent-' + accent : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
