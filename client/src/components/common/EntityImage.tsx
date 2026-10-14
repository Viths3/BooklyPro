import { useState } from 'react';

export function EntityImage({
  url,
  name,
  className = 'business-image',
  local = false,
}: {
  url?: string | null;
  name: string;
  className?: string;
  local?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const valid =
    url &&
    (local ? url.startsWith('blob:') : /^https?:\/\//.test(url)) &&
    failedUrl !== url;
  if (!valid)
    return (
      <div
        className={`business-placeholder ${className}`}
        role="img"
        aria-label={`Sin imagen de ${name}`}
      >
        <span>{name.slice(0, 1)}</span>
        <i />
      </div>
    );
  return (
    <img
      className={className}
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setFailedUrl(url)}
    />
  );
}
