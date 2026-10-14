import { useEffect, useId, useRef } from 'react';
import { Button } from './ui';
export function ConfirmDialog({
  busy,
  onClose,
  onConfirm,
  title = '¿Seguro que quieres cancelar esta cita?',
  description = 'El horario quedará disponible. Esta acción no se puede deshacer.',
  confirmLabel = 'Sí, cancelar cita',
  closeLabel = 'Conservar cita',
}: {
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  closeLabel?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
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
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id={`${id}-title`}>{title}</h2>
      <p id={`${id}-description`}>{description}</p>
      <div className="appointment-links">
        <Button variant="secondary" disabled={busy} onClick={onClose} autoFocus>
          {closeLabel}
        </Button>
        <Button variant="danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Guardando…' : confirmLabel}
        </Button>
      </div>
      {busy && <p role="status">Guardando cambios…</p>}
    </dialog>
  );
}
