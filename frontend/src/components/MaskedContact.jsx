import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/**
 * Displays a masked value (mobile/email as returned by the API) with an
 * optional "Reveal" action for Administrators. Calling onReveal() is
 * expected to hit an ?unmask=true endpoint, which the backend only serves
 * to Administrators and always logs to the audit trail.
 */
export default function MaskedContact({ maskedValue, onReveal, label }) {
  const { user } = useAuth();
  const [revealed, setRevealed] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!maskedValue) return <span>—</span>;

  async function reveal() {
    if (revealed) { setRevealed(null); return; } // toggle back to masked view
    setBusy(true);
    try {
      const value = await onReveal();
      setRevealed(value);
    } catch (e) {
      // silently ignore — button simply stays in masked state
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span className="mono">{revealed || maskedValue}</span>
      {user.role === 'Administrator' && onReveal && (
        <button type="button" className="btn btn-ghost btn-sm" title={revealed ? `Hide ${label || 'value'}` : `Reveal ${label || 'value'} (logged to audit trail)`}
          onClick={reveal} disabled={busy} style={{ padding: 2 }}>
          {busy ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (revealed ? <EyeOff size={13} /> : <Eye size={13} />)}
        </button>
      )}
    </span>
  );
}
