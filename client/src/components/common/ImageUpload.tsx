import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './ui';
import { EntityImage } from './EntityImage';
import { validateImage, ImageUploadError } from '../../api/uploads';

export type ImageUploadAction = (
  file: File,
  signal: AbortSignal,
) => Promise<string>;
export function ImageUpload({
  value,
  onChange,
  upload,
  onPendingChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  upload?: ImageUploadAction;
  onPendingChange: (pending: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const [preview, setPreview] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  function clearPreview() {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
    setPreview(undefined);
  }
  function cancel() {
    controller.current?.abort();
    controller.current = null;
    clearPreview();
    setPending(false);
    onPendingChange(false);
  }
  async function select(file?: File) {
    if (!file || disabled || controller.current) return;
    setError('');
    setSuccess(false);
    try {
      validateImage(file);
    } catch (cause) {
      setError((cause as Error).message);
      return;
    }
    if (!upload) {
      setError('La carga de imágenes no está disponible.');
      return;
    }
    const request = new AbortController();
    controller.current = request;
    clearPreview();
    previewUrl.current = URL.createObjectURL(file);
    setPreview(previewUrl.current);
    setPending(true);
    onPendingChange(true);
    try {
      const url = await upload(file, request.signal);
      if (!request.signal.aborted) {
        onChange(url);
        setSuccess(true);
      }
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof ImageUploadError
            ? cause.message
            : 'No pudimos subir la imagen. Inténtalo de nuevo; la foto anterior se conserva.',
        );
    } finally {
      if (controller.current === request) {
        controller.current = null;
        clearPreview();
        setPending(false);
        onPendingChange(false);
      }
    }
  }
  return (
    <div
      className="image-upload"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void select(event.dataTransfer.files[0]);
      }}
    >
      <label htmlFor={id}>Foto del negocio</label>
      <EntityImage
        key={preview || value}
        url={preview || value}
        local={Boolean(preview)}
        name="Foto del negocio"
        className="image-upload-preview"
      />
      <input
        ref={input}
        id={id}
        className="image-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled || pending}
        aria-describedby={`${id}-help ${id}-error`}
        aria-invalid={Boolean(error)}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void select(file);
        }}
      />
      <small id={`${id}-help`}>
        JPEG, PNG o WebP · máximo 5 MB. Selecciona o arrastra una imagen. Guarda
        el formulario para aplicar el cambio.
      </small>
      <div className="appointment-links">
        <Button
          disabled={disabled || pending}
          variant="secondary"
          onClick={() => input.current?.click()}
        >
          {value ? 'Cambiar imagen' : 'Subir imagen'}
        </Button>
        {pending ? (
          <Button variant="secondary" onClick={cancel}>
            Cancelar carga
          </Button>
        ) : (
          value && (
            <Button
              disabled={disabled}
              variant="secondary"
              onClick={() => {
                onChange('');
                setSuccess(false);
                setError('');
              }}
            >
              Eliminar imagen
            </Button>
          )
        )}
      </div>
      {pending && <p role="status">Subiendo imagen…</p>}
      {success && (
        <p role="status">
          Imagen subida. Guarda el negocio para aplicar el cambio.
        </p>
      )}
      <p id={`${id}-error`} role={error ? 'alert' : undefined}>
        {error}
      </p>
    </div>
  );
}
