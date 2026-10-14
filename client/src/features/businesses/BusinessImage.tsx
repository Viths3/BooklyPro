import { EntityImage } from '../../components/common/EntityImage';
export function BusinessImage({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  return <EntityImage url={url} name={name} />;
}
