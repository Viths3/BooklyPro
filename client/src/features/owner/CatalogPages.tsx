import { useState } from 'react';
import {
  Button,
  Card,
  EmptyState,
  ErrorMessage,
  Loading,
} from '../../components/common/ui';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ActiveState, useOwnerBusiness } from './BusinessPages';
import { useEmployees, useOwnerMutation, useServices } from './hooks';
import { OwnerForm, type FormKind } from './OwnerForm';
import type { Employee, Service } from './api';

function Assignments({ employee }: { employee: Employee }) {
  const b = useOwnerBusiness();
  const services = useServices(b.id);
  const mutation = useOwnerMutation(b.id, 'employees');
  return (
    <div className="owner-assignments">
      <h4>Servicios asignados a {employee.firstName}</h4>
      {employee.services.length === 0 && <p>Sin servicios asignados.</p>}
      {employee.services.map((service) => (
        <div className="owner-row" key={service.id}>
          <span>
            {service.name} · {service.active ? 'Activo' : 'Inactivo'}
          </span>
          <Button
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                path: `/api/employees/${employee.id}/services/${service.id}`,
                method: 'DELETE',
              })
            }
          >
            Quitar {service.name}
          </Button>
        </div>
      ))}
      {services.isPending ? (
        <Loading />
      ) : services.error ? (
        <ErrorMessage error={services.error} />
      ) : (
        services.data
          .filter(
            (s) =>
              s.active &&
              !employee.services.some((assigned) => assigned.id === s.id),
          )
          .map((service) => (
            <Button
              key={service.id}
              variant="secondary"
              disabled={!b.active || !employee.active || mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  path: `/api/employees/${employee.id}/services/${service.id}`,
                  method: 'POST',
                })
              }
            >
              Asignar {service.name}
            </Button>
          ))
      )}
      {(!b.active || !employee.active) && (
        <p>
          Activa el empleado en un negocio activo para asignar nuevos servicios.
        </p>
      )}
      {mutation.error && <ErrorMessage error={mutation.error} />}
    </div>
  );
}
function Catalog({
  kind,
  items,
  loading,
  error,
  retry,
}: {
  kind: 'service' | 'employee';
  items: Service[] | Employee[] | undefined;
  loading: boolean;
  error: unknown;
  retry: () => void;
}) {
  const b = useOwnerBusiness();
  const area = kind === 'service' ? 'services' : 'employees';
  const mutation = useOwnerMutation(b.id, area);
  const [editing, setEditing] = useState<Service | Employee | 'new' | null>(
    null,
  );
  const [deactivating, setDeactivating] = useState<Service | Employee | null>(
    null,
  );
  const label = kind === 'service' ? 'servicio' : 'empleado';
  const title = (item: Service | Employee) =>
    'name' in item ? item.name : `${item.firstName} ${item.lastName}`;
  const initial =
    editing && editing !== 'new'
      ? Object.fromEntries(
          Object.entries(editing)
            .filter(
              ([, v]) =>
                typeof v === 'string' || typeof v === 'number' || v === null,
            )
            .map(([k, v]) => [k, String(v ?? '')]),
        )
      : {};
  return (
    <>
      <h2>{kind === 'service' ? 'Servicios' : 'Empleados'}</h2>
      <Button
        disabled={!b.active || mutation.isPending}
        onClick={() => {
          mutation.reset();
          setEditing('new');
        }}
      >
        Crear {label}
      </Button>
      {editing && (
        <Card>
          <h3>
            {editing === 'new' ? 'Crear' : 'Editar'} {label}
          </h3>
          <OwnerForm
            key={editing === 'new' ? 'new' : editing.id}
            kind={kind as FormKind}
            initial={initial}
            busy={mutation.isPending}
            onClose={() => setEditing(null)}
            onSave={(body) =>
              mutation.mutate(
                {
                  path:
                    editing === 'new'
                      ? `/api/businesses/${b.id}/${area}`
                      : `/api/${area}/${editing.id}`,
                  method: editing === 'new' ? 'POST' : 'PATCH',
                  body,
                },
                { onSuccess: () => setEditing(null) },
              )
            }
          />
        </Card>
      )}
      {mutation.error && <ErrorMessage error={mutation.error} />}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage error={error} onRetry={retry} />
      ) : !items?.length ? (
        <EmptyState
          title={`Sin ${kind === 'service' ? 'servicios' : 'empleados'}`}
          description={`Crea tu primer ${label} para comenzar.`}
        />
      ) : (
        <div className="owner-grid">
          {items.map((item) => (
            <Card key={item.id}>
              <ActiveState active={item.active} />
              <h3>{title(item)}</h3>
              {'price' in item ? (
                <>
                  <p>
                    {item.price} {b.currency} · {item.durationMinutes} minutos
                  </p>
                  <p>{item.description}</p>
                </>
              ) : (
                <>
                  <p>{item.email}</p>
                  <p>{item.phone}</p>
                </>
              )}
              <div className="appointment-links">
                <Button
                  variant="secondary"
                  disabled={!b.active || mutation.isPending}
                  onClick={() => {
                    mutation.reset();
                    setEditing(item);
                  }}
                >
                  Editar {title(item)}
                </Button>
                {item.active ? (
                  <Button
                    variant="secondary"
                    disabled={mutation.isPending}
                    onClick={() => setDeactivating(item)}
                  >
                    Desactivar {title(item)}
                  </Button>
                ) : (
                  <Button
                    disabled={!b.active || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        path: `/api/${area}/${item.id}`,
                        method: 'PATCH',
                        body: { active: true },
                      })
                    }
                  >
                    Reactivar {title(item)}
                  </Button>
                )}
              </div>
              {'services' in item && <Assignments employee={item} />}
            </Card>
          ))}
        </div>
      )}
      {deactivating && (
        <ConfirmDialog
          title={`¿Desactivar ${title(deactivating)}?`}
          description="Dejará de estar disponible para nuevas reservas. Se conservará su historial."
          confirmLabel="Desactivar"
          closeLabel="Volver"
          busy={mutation.isPending}
          onClose={() => setDeactivating(null)}
          onConfirm={() =>
            mutation.mutate(
              { path: `/api/${area}/${deactivating.id}`, method: 'DELETE' },
              { onSettled: () => setDeactivating(null) },
            )
          }
        />
      )}
    </>
  );
}
export function ServicesPage() {
  const b = useOwnerBusiness();
  const q = useServices(b.id);
  return (
    <Catalog
      kind="service"
      items={q.data}
      loading={q.isPending}
      error={q.error}
      retry={() => void q.refetch()}
    />
  );
}
export function EmployeesPage() {
  const b = useOwnerBusiness();
  const q = useEmployees(b.id);
  return (
    <Catalog
      kind="employee"
      items={q.data}
      loading={q.isPending}
      error={q.error}
      retry={() => void q.refetch()}
    />
  );
}
