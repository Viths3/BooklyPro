import { forwardRef, type SelectHTMLAttributes } from 'react';
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    id: string;
    label: string;
    error?: string;
  }
>(function Select({ id, label, error, children, ...props }, ref) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        {...props}
        ref={ref}
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {children}
      </select>
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
});
