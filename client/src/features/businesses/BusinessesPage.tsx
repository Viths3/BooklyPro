import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { businessApi } from './api';
import { queryKeys } from '../../lib/query';
import { BusinessImage } from './BusinessImage';
import {
  Button,
  Input,
  Loading,
  ErrorMessage,
  EmptyState,
  Arrow,
} from '../../components/common/ui';
export function BusinessesPage() {
  const [params, setParams] = useSearchParams();
  const rawPage = Number(params.get('page') ?? 1);
  const page =
    Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
  const search = (params.get('search') ?? '').slice(0, 150);
  const query = useQuery({
    queryKey: queryKeys.businesses.list(page, search),
    queryFn: ({ signal }) => businessApi.list(page, search, signal),
  });
  const go = (next: number) =>
    setParams({ page: String(next), ...(search ? { search } : {}) });
  return (
    <section className="container page">
      <div className="page-heading">
        <p className="eyebrow">DESCUBRE BOOKLYPRO</p>
        <h1>Encuentra tu próximo lugar.</h1>
        <p>Negocios, personas y servicios. Elige con toda la información.</p>
      </div>
      <form
        key={search}
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const draft = String(
            new FormData(event.currentTarget).get('search') ?? '',
          ).trim();
          setParams({ ...(draft ? { search: draft } : {}) });
        }}
      >
        <Input
          id="business-search"
          name="search"
          label="Buscar por nombre"
          type="search"
          placeholder="¿Qué lugar estás buscando?"
          maxLength={150}
          defaultValue={search}
        />
        <Button type="submit">
          Buscar <span aria-hidden="true">→</span>
        </Button>
      </form>
      {query.isPending ? (
        <Loading label="Buscando negocios…" />
      ) : query.isError ? (
        <ErrorMessage
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <div className="results-heading">
            <p>
              <strong>{query.data.pagination.total}</strong>{' '}
              {query.data.pagination.total === 1
                ? 'negocio disponible'
                : 'negocios disponibles'}
            </p>
            <span>Para descubrir, a tu ritmo.</span>
          </div>
          {query.data.data.length === 0 ? (
            <EmptyState
              title="Todavía no hay resultados"
              description={
                search
                  ? 'Prueba con otro nombre para encontrar tu próximo lugar.'
                  : 'Los negocios disponibles aparecerán aquí.'
              }
            />
          ) : (
            <div className="business-grid">
              {query.data.data.map((business) => (
                <article className="business-card" key={business.id}>
                  <Link
                    to={`/businesses/${business.id}`}
                    className="business-card-image"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <BusinessImage
                      key={business.imageUrl}
                      url={business.imageUrl}
                      name={business.name}
                    />
                  </Link>
                  <div className="business-card-body">
                    <p className="eyebrow">DESCUBRE ESTE LUGAR</p>
                    <h2>
                      <Link to={`/businesses/${business.id}`}>
                        {business.name}
                      </Link>
                    </h2>
                    <p className="business-address">
                      {business.address ?? 'Dirección por confirmar'}
                    </p>
                    <p className="business-description">
                      {business.description ??
                        'Conoce sus servicios, su equipo y las experiencias de sus clientes.'}
                    </p>
                    <Link
                      className="text-link"
                      to={`/businesses/${business.id}`}
                    >
                      Ver negocio <Arrow />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
          <nav className="pagination" aria-label="Paginación de negocios">
            <Button
              variant="secondary"
              disabled={page <= 1 || query.isFetching}
              onClick={() => go(page - 1)}
            >
              ← Anterior
            </Button>
            <span aria-live="polite">
              Página {page} de {Math.max(1, query.data.pagination.totalPages)}
            </span>
            <Button
              variant="secondary"
              disabled={
                page >= query.data.pagination.totalPages || query.isFetching
              }
              onClick={() => go(page + 1)}
            >
              Siguiente →
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
