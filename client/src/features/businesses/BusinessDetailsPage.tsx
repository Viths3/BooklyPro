import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { z } from 'zod';
import { businessApi } from './api';
import { queryKeys } from '../../lib/query';
import {
  Loading,
  ErrorMessage,
  EmptyState,
  Card,
} from '../../components/common/ui';
import { BusinessImage } from './BusinessImage';
export function BusinessDetailsPage() {
  const { businessId = '' } = useParams();
  const valid = z.uuid().safeParse(businessId).success;
  const business = useQuery({
    queryKey: queryKeys.businesses.detail(businessId),
    queryFn: ({ signal }) => businessApi.detail(businessId, signal),
    enabled: valid,
  });
  const ready = valid && business.isSuccess;
  const services = useQuery({
    queryKey: queryKeys.services(businessId),
    queryFn: ({ signal }) => businessApi.services(businessId, signal),
    enabled: ready,
  });
  const employees = useQuery({
    queryKey: queryKeys.employees(businessId),
    queryFn: ({ signal }) => businessApi.employees(businessId, signal),
    enabled: ready,
  });
  const reviews = useQuery({
    queryKey: queryKeys.reviews(businessId),
    queryFn: ({ signal }) => businessApi.reviews(businessId, signal),
    enabled: ready,
  });
  if (!valid)
    return (
      <section className="container page">
        <EmptyState
          title="Negocio no encontrado"
          description="Comprueba el enlace o explora los negocios disponibles."
        />
        <Link className="text-link" to="/businesses">
          Volver a negocios →
        </Link>
      </section>
    );
  if (business.isPending) return <Loading label="Cargando el negocio…" />;
  if (business.isError)
    return (
      <section className="container page">
        <ErrorMessage
          error={business.error}
          onRetry={() => void business.refetch()}
        />
        <Link to="/businesses" className="text-link">
          Volver a negocios →
        </Link>
      </section>
    );
  const item = business.data.data;
  return (
    <section className="container page">
      <Link className="back-link" to="/businesses">
        ← Todos los negocios
      </Link>
      <div className="business-hero">
        <div>
          <p className="eyebrow">CONOCE TU PRÓXIMO LUGAR</p>
          <h1>{item.name}</h1>
          <p className="detail-description">
            {item.description ??
              'Conoce los servicios y al equipo de este negocio.'}
          </p>
          <div className="contact-list">
            {item.address && (
              <p>
                <span>Dirección</span>
                {item.address}
              </p>
            )}
            {item.phone && (
              <p>
                <span>Teléfono</span>
                <a href={`tel:${item.phone.replace(/[^+0-9]/g, '')}`}>
                  {item.phone}
                </a>
              </p>
            )}
          </div>
        </div>
        <div className="detail-image">
          <BusinessImage
            key={item.imageUrl}
            url={item.imageUrl}
            name={item.name}
          />
        </div>
      </div>
      <nav className="detail-nav" aria-label="Secciones del negocio">
        <a href="#services">Servicios</a>
        <a href="#team">Equipo</a>
        <a href="#reviews">Reseñas</a>
      </nav>
      <section id="services" className="detail-section">
        <p className="eyebrow">ENCUENTRA LO QUE NECESITAS</p>
        <h2>Sus servicios</h2>
        {services.isPending ? (
          <Loading />
        ) : services.isError ? (
          <ErrorMessage
            error={services.error}
            onRetry={() => void services.refetch()}
          />
        ) : services.data.data.length === 0 ? (
          <EmptyState
            title="Servicios por anunciar"
            description="Este negocio todavía no ha publicado sus servicios."
          />
        ) : (
          <div className="services-list">
            {services.data.data.map((service) => (
              <Card key={service.id} className="service-card">
                <div>
                  <h3>{service.name}</h3>
                  {service.description && <p>{service.description}</p>}
                  <span className="badge">{service.durationMinutes} min</span>
                </div>
                <strong className="service-price">
                  {service.price} <small>{item.currency}</small>
                </strong>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section id="team" className="detail-section">
        <p className="eyebrow">LAS PERSONAS DETRÁS</p>
        <h2>Conoce al equipo</h2>
        {employees.isPending ? (
          <Loading />
        ) : employees.isError ? (
          <ErrorMessage
            error={employees.error}
            onRetry={() => void employees.refetch()}
          />
        ) : employees.data.data.length === 0 ? (
          <EmptyState
            title="Equipo por anunciar"
            description="Aquí podrás conocer a los profesionales del negocio."
          />
        ) : (
          <div className="team-grid">
            {employees.data.data.map((employee) => (
              <Card key={employee.id} className="team-card">
                <span className="avatar" aria-hidden="true">
                  {employee.firstName.slice(0, 1)}
                  {employee.lastName.slice(0, 1)}
                </span>
                <h3>
                  {employee.firstName} {employee.lastName}
                </h3>
                <p>Parte del equipo</p>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section id="reviews" className="detail-section">
        <p className="eyebrow">EXPERIENCIAS REALES</p>
        <h2>Lo que dicen sus clientes</h2>
        {reviews.isPending ? (
          <Loading />
        ) : reviews.isError ? (
          <ErrorMessage
            error={reviews.error}
            onRetry={() => void reviews.refetch()}
          />
        ) : (
          <>
            <div className="review-summary">
              <strong>
                {reviews.data.summary.averageRating === null
                  ? '—'
                  : reviews.data.summary.averageRating.toFixed(1)}{' '}
                <span aria-hidden="true">★</span>
              </strong>
              <p>{reviews.data.summary.totalReviews} reseñas</p>
            </div>
            {reviews.data.data.length === 0 ? (
              <EmptyState
                title="Cada historia empieza con alguien"
                description="Este negocio todavía no tiene reseñas."
              />
            ) : (
              <div className="review-list">
                {reviews.data.data.map((review) => (
                  <Card key={review.id} className="review-card">
                    <div>
                      <strong>{review.customer.firstName}</strong>
                      <span aria-label={`${review.rating} de 5 estrellas`}>
                        {'★'.repeat(review.rating)}
                        {'☆'.repeat(5 - review.rating)}
                      </span>
                    </div>
                    {review.comment && <p>{review.comment}</p>}
                    <time dateTime={review.createdAt}>
                      {new Intl.DateTimeFormat('es', {
                        dateStyle: 'medium',
                      }).format(new Date(review.createdAt))}
                    </time>
                  </Card>
                ))}
              </div>
            )}
            {reviews.data.pagination.total > 5 && (
              <p className="muted">Mostrando las 5 reseñas más recientes.</p>
            )}
          </>
        )}
      </section>
    </section>
  );
}
