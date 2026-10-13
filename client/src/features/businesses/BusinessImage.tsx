import { useState } from 'react';
export function BusinessImage({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || !/^https?:\/\//.test(url) || failed)
    return (
      <div className="business-placeholder" aria-hidden="true">
        <span>{name.slice(0, 1)}</span>
        <i />
      </div>
    );
  return (
    <img
      className="business-image"
      src={url}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
