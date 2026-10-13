import { useEffect, useRef } from 'react';
import { Button } from './ui';
export function ConfirmDialog({
  busy,
  onClose,
  onConfirm,
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      aria-labelledby="cancel-title"
      aria-describedby="cancel-description"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="cancel-title">¿Seguro que quieres cancelar esta cita?</h2>
      <p id="cancel-description">
        El horario quedará disponible. Esta acción no se puede deshacer.
      </p>
      <div className="appointment-links">
        <Button variant="secondary" disabled={busy} onClick={onClose} autoFocus>
          Conservar cita
        </Button>
        <Button disabled={busy} onClick={onConfirm}>
          {busy ? 'Cancelando…' : 'Sí, cancelar cita'}
        </Button>
      </div>
      {busy && <p role="status">Cancelando tu cita…</p>}
    </dialog>
  );
}
