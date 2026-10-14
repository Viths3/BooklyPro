import type { ReactNode } from 'react';
export function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <p className="notice success-message" role="status">
      {children}
    </p>
  );
}
