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
