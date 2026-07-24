const MAP = {
  'Pending Approval': 'stamp-pending',
  'Approved': 'stamp-approved',
  'Rejected': 'stamp-rejected',
  'Condoned': 'stamp-condoned',
  'Warning': 'stamp-warning',
  'Penalty': 'stamp-penalty',
  'Outstanding': 'stamp-penalty',
  'Paid': 'stamp-approved',
  'Waived': 'stamp-condoned',
};

export default function StatusBadge({ status }) {
  if (!status) return <span className="stamp stamp-condoned">—</span>;
  const cls = MAP[status] || 'stamp-condoned';
  return <span className={`stamp ${cls}`}>{status}</span>;
}

const LEVEL_COLORS = {
  Community: '#2C5B6B',
  Block: '#6C4F9C',
  Floor: '#B9822B',
  Flat: '#2C6B4A',
};

export function LevelBadge({ level }) {
  if (!level) return null;
  const color = LEVEL_COLORS[level] || 'var(--ink-soft)';
  return (
    <span className="chip" style={{ background: `${color}1A`, color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 10.5, letterSpacing: '0.04em' }}>
      {level}
    </span>
  );
}
