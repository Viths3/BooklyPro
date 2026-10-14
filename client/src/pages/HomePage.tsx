import { Link, useNavigate } from 'react-router-dom';
import { Button, Input } from '../components/common/ui';

export function HomePage() {
  const navigate = useNavigate();
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">RESERVAS ONLINE</p>
          <h1>
            Encuentra tu lugar.
            <br />
            <span>Reserva tu próxima cita.</span>
          </h1>
          <p className="hero-description">
            Consulta servicios, compara precios y elige un horario disponible.
            Sin llamadas ni mensajes de ida y vuelta.
          </p>
          <form
            className="home-search"
            onSubmit={(event) => {
              event.preventDefault();
              const search = String(
                new FormData(event.currentTarget).get('search') ?? '',
              ).trim();
              navigate(
                `/businesses${search ? `?${new URLSearchParams({ search })}` : ''}`,
              );
            }}
          >
            <Input
              id="home-search"
              name="search"
              label="¿Qué negocio buscas?"
              type="search"
              placeholder="Nombre del negocio"
              maxLength={150}
            />
            <Button type="submit">Buscar negocios</Button>
          </form>
          <Link className="text-link" to="/businesses">
            Ver todos los negocios →
          </Link>
        </div>
        <aside className="home-guide" aria-label="Cómo reservar">
          <div className="home-guide-heading">
            <span>Una cita, en tres pasos</span>
            <span aria-hidden="true">01—03</span>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div>
                <h2>Elige el servicio</h2>
                <p>Revisa el precio, la duración y las reseñas del negocio.</p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h2>Encuentra un horario</h2>
                <p>Selecciona al profesional y consulta su disponibilidad.</p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h2>Confirma tu reserva</h2>
                <p>Inicia sesión y guarda la cita en tu cuenta.</p>
              </div>
            </li>
          </ol>
          <p className="home-guide-note">
            Tus próximas citas y tu historial, en el mismo lugar.
          </p>
        </aside>
      </section>
      <section className="container home-workspaces">
        <div>
          <p className="eyebrow">PARA CLIENTES</p>
          <h2>Ten tus citas a mano.</h2>
          <p>
            Consulta los detalles, cancela si cambian tus planes y comparte tu
            experiencia después de la visita.
          </p>
          <Link className="text-link" to="/dashboard/appointments">
            Ir a mis citas →
          </Link>
        </div>
        <div>
          <p className="eyebrow">PARA NEGOCIOS</p>
          <h2>Organiza tu agenda.</h2>
          <p>
            Gestiona servicios, equipo, horarios y reservas desde el panel de tu
            negocio.
          </p>
          <Link className="text-link" to="/dashboard/businesses">
            Gestionar mi negocio →
          </Link>
        </div>
      </section>
    </>
  );
}
