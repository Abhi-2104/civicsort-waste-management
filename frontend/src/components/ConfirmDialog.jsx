import { useEffect, useRef } from 'react';
import { AlertTriangle, Trash2, Info } from 'lucide-react';

/**
 * Reusable standardized confirmation dialog (Enhancement 19).
 *
 * Props:
 *   open        – boolean – whether the dialog is visible
 *   title       – string  – dialog heading
 *   message     – string | ReactNode – body message
 *   confirmLabel – string – confirm button text (default "Yes")
 *   cancelLabel  – string – cancel button text (default "No")
 *   variant     – 'danger' | 'warning' | 'default'
 *   onConfirm   – () => void
 *   onCancel    – () => void
 *   children    – optional extra content below message
 */
export default function ConfirmDialog({
  open,
  title = 'Confirm',
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  variant = 'default',
  onConfirm,
  onCancel,
  children,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    // Focus confirm button when dialog opens
    setTimeout(() => confirmRef.current?.focus(), 80);

    function handleKey(e) {
      if (e.key === 'Escape') onCancel?.();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const iconMap = {
    danger: <Trash2 size={22} />,
    warning: <AlertTriangle size={22} />,
    default: <Info size={22} />,
  };

  const variantClass = {
    danger: 'confirm-dialog-danger',
    warning: 'confirm-dialog-warning',
    default: 'confirm-dialog-default',
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className={`confirm-dialog ${variantClass[variant] || ''}`} onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-icon">{iconMap[variant]}</div>
        <h3 className="confirm-dialog-title">{title}</h3>
        <p className="confirm-dialog-message">{message}</p>
        {children}
        <div className="confirm-dialog-actions">
          <button
            ref={confirmRef}
            className={`btn ${variant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button className="btn btn-outline" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
