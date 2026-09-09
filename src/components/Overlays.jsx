import { useEffect, useRef, useState } from 'react';

export function DragOverlay({ show }) {
  if (!show) return null;
  return (
    <div className="dragover">
      <div>
        <b>Drop to save</b>
        <span>.html · folder · .zip</span>
      </div>
    </div>
  );
}

export function Toasts({ items, onDismiss }) {
  if (!items.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={'toast' + (t.kind === 'error' ? ' err' : '')}>
          <span>{t.text}</span>
          {t.action && <button onClick={t.action.run}>{t.action.label}</button>}
          <button onClick={() => onDismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel, danger, onCancel, onConfirm }) {
  const ref = useRef(null);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => ref.current && ref.current.focus(), 20);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  if (!open) return null;

  return (
    <div className="scrim mid" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="modal"
        style={{ width: 400 }}
        role="alertdialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      >
        <div className="modal-body" style={{ paddingTop: 16 }}>
          <b style={{ fontSize: 13.5, color: 'var(--fg-strong)' }}>{title}</b>
          <div style={{ fontSize: 12.5, color: 'var(--fg-muted)', lineHeight: 1.6 }}>{body}</div>
        </div>
        <div className="modal-foot">
          <div className="hint" />
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            ref={ref}
            className="btn primary"
            style={danger ? { background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' } : undefined}
            onClick={onConfirm}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PromptDialog({ open, title, label, placeholder, initial, onCancel, onSubmit }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setValue(initial || '');
    const t = setTimeout(() => {
      if (ref.current) {
        ref.current.focus();
        ref.current.select();
      }
    }, 20);
    return () => clearTimeout(t);
  }, [open, initial]);

  if (!open) return null;

  return (
    <div className="scrim mid" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="modal"
        style={{ width: 420 }}
        role="dialog"
        aria-modal="true"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit(value);
          }
        }}
      >
        <div className="modal-body" style={{ paddingTop: 16 }}>
          <b style={{ fontSize: 13.5, color: 'var(--fg-strong)' }}>{title}</b>
          <div className="field">
            <label>{label}</label>
            <input
              ref={ref}
              className="text-input"
              value={value}
              placeholder={placeholder}
              onChange={(e) => setValue(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
        <div className="modal-foot">
          <div className="hint" />
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSubmit(value)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
