import {
  forwardRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { errorMessage } from '../../api/client';
export function Button({
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  return (
    <button
      type={type}
      className={`button button-${variant} ${className}`}
      {...props}
    />
  );
}
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
  }
>(function Input({ label, error, hint, id, required, ...props }, ref) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        {...props}
        id={id}
        ref={ref}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={
          [
            error ? `${id}-error` : hint ? `${id}-hint` : '',
            required ? `${id}-required` : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined
        }
      />
      {required && (
        <small id={`${id}-required`} className="required-hint">
          Obligatorio
        </small>
      )}
      {hint && !error && <small id={`${id}-hint`}>{hint}</small>}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
});
export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}
export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
export function ErrorMessage({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <p>{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Volver a intentar
        </Button>
      )}
    </div>
  );
}
export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <span className="empty-symbol" aria-hidden="true">
        ◇
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
export function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
