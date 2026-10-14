import { statusLabels, type Status } from '../../features/appointments/api';
type State = Status | 'ACTIVE' | 'INACTIVE';
const labels: Record<State, string> = {
  ...statusLabels,
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};
export function StatusBadge({ status }: { status: State }) {
  return (
    <span className={`badge status-badge status-${status.toLowerCase()}`}>
      <span className="status-marker" aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
