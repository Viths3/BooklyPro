import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button, Input } from '../../components/common/ui';
export type FormKind = 'business' | 'service' | 'employee';
const name = (max: number) =>
  z.string().trim().min(1, 'Campo obligatorio.').max(max);
const phone = z
  .string()
  .trim()
  .refine(
    (v) => !v || (v.length >= 3 && v.length <= 30 && /^[+0-9() .-]+$/.test(v)),
    'Teléfono inválido.',
  );
const fields = {
  business: {
    name: ['Nombre', name(150)],
    description: ['Descripción', z.string().trim().max(5000)],
    phone: ['Teléfono', phone],
    address: ['Dirección', z.string().trim().max(500)],
    imageUrl: [
      'URL de imagen',
      z
        .string()
        .trim()
        .refine(
          (v) =>
            !v ||
            (z.url().max(2048).safeParse(v).success &&
              /^https?:/.test(v) &&
              !new URL(v).username &&
              !new URL(v).password),
          'Usa una URL HTTP(S) válida.',
        ),
    ],
  },
  service: {
    name: ['Nombre', name(150)],
    description: ['Descripción', z.string().trim().max(5000)],
    price: [
      'Precio',
      z
        .string()
        .trim()
        .regex(
          /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/,
          'Usa un precio positivo o cero, con máximo dos decimales.',
        ),
    ],
    durationMinutes: [
      'Duración (minutos)',
      z
        .string()
        .regex(/^\d+$/)
        .refine(
          (v) => Number(v) > 0 && Number(v) <= 1440,
          'Usa un entero entre 1 y 1440.',
        ),
    ],
  },
  employee: {
    firstName: ['Nombres', name(100)],
    lastName: ['Apellidos', name(100)],
    email: [
      'Correo',
      z
        .string()
        .trim()
        .refine(
          (v) => !v || z.email().max(254).safeParse(v).success,
          'Correo inválido.',
        ),
    ],
    phone: ['Teléfono', phone],
  },
} satisfies Record<FormKind, Record<string, [string, z.ZodType]>>;
export function fieldsSchema(kind: FormKind) {
  return z.record(z.string(), z.string()).superRefine((values, ctx) => {
    for (const [key, [, schema]] of Object.entries(fields[kind])) {
      const result = schema.safeParse(values[key] ?? '');
      if (!result.success)
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: result.error.issues[0]?.message ?? 'Valor inválido.',
        });
    }
  });
}
export function formBody(kind: FormKind, values: Record<string, string>) {
  return Object.fromEntries(
    Object.keys(fields[kind]).map((key) => {
      const value = (values[key] ?? '').trim();
      return [
        key,
        key === 'durationMinutes'
          ? Number(value)
          : key === 'email'
            ? value.toLowerCase() || null
            : value || null,
      ];
    }),
  );
}
export function OwnerForm({
  kind,
  initial = {},
  busy,
  onSave,
  onClose,
}: {
  kind: FormKind;
  initial?: Record<string, string>;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Record<string, string>>({
    resolver: zodResolver(fieldsSchema(kind)),
    defaultValues: initial,
  });
  return (
    <form
      className="owner-form"
      onSubmit={handleSubmit((values) => onSave(formBody(kind, values)))}
      noValidate
    >
      <fieldset disabled={busy}>
        {Object.entries(fields[kind]).map(([key, [label]]) =>
          key === 'description' ? (
            <div className="field" key={key}>
              <label htmlFor="owner-description">{label}</label>
              <textarea
                id="owner-description"
                rows={4}
                maxLength={5000}
                {...register(key)}
                aria-invalid={Boolean(errors[key])}
                aria-describedby="owner-description-help"
              />
              <small id="owner-description-help">
                {errors[key]?.message || 'Opcional. Máximo 5000 caracteres.'}
              </small>
            </div>
          ) : (
            <Input
              key={key}
              id={`owner-${key}`}
              label={label}
              required={[
                'name',
                'firstName',
                'lastName',
                'price',
                'durationMinutes',
              ].includes(key)}
              hint={
                key === 'price'
                  ? 'Usa punto decimal, por ejemplo 8.50.'
                  : key === 'durationMinutes'
                    ? 'Entre 1 y 1440 minutos, sin decimales.'
                    : undefined
              }
              type={
                key === 'email'
                  ? 'email'
                  : key === 'phone'
                    ? 'tel'
                    : key === 'imageUrl'
                      ? 'url'
                      : 'text'
              }
              {...register(key)}
              error={errors[key]?.message}
              inputMode={
                key === 'price'
                  ? 'decimal'
                  : key === 'durationMinutes'
                    ? 'numeric'
                    : undefined
              }
            />
          ),
        )}
        <div className="appointment-links">
          <Button type="submit">{busy ? 'Guardando…' : 'Guardar'}</Button>
          <Button variant="secondary" onClick={onClose}>
            Cerrar formulario
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
