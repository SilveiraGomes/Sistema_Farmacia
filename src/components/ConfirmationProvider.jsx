import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LogOut, Power, Trash2, X } from 'lucide-react';
import { setConfirmationDispatcher } from '../utils/confirmations.mjs';

const toneIcons = {
  danger: Trash2,
  logout: LogOut,
  close: Power,
  success: CheckCircle2,
  warning: AlertTriangle,
};

function ConfirmationProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);
  const cancelButtonRef = useRef(null);

  useEffect(() => {
    return setConfirmationDispatcher((options) =>
      new Promise((resolve) => {
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setDialog(options);
      }));
  }, []);

  useEffect(() => {
    if (!dialog) {
      return undefined;
    }

    cancelButtonRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        closeDialog(false);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  function closeDialog(result) {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolve?.(result);
  }

  const Icon = toneIcons[dialog?.tone] || AlertTriangle;

  return (
    <>
      {children}
      {dialog ? (
        <div
          className="confirm-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog(false);
            }
          }}
        >
          <section
            className={`confirm-card ${dialog.tone}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
          >
            <div className="confirm-title-row">
              <span className="confirm-icon">
                <Icon size={28} />
              </span>
              <button
                type="button"
                className="confirm-close"
                aria-label="Fechar"
                onClick={() => closeDialog(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="confirm-copy">
              <h2 id="confirm-title">{dialog.title}</h2>
              <p id="confirm-message">{dialog.message}</p>
            </div>
            <div className="confirm-actions">
              <button
                type="button"
                className="soft-button"
                ref={cancelButtonRef}
                onClick={() => closeDialog(false)}
              >
                {dialog.cancelLabel}
              </button>
              <button
                type="button"
                className={`confirm-primary ${dialog.tone}`}
                onClick={() => closeDialog(true)}
              >
                <Icon size={18} />
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

export default ConfirmationProvider;
