import { Link } from 'react-router-dom';
import { Arrow } from '../components/common/ui';
export function HomePage() {
  return (
    <>
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" />
            UN ESPACIO PARA TU TIEMPO
          </p>
          <h1>
            Encuentra tu lugar.
            <br />
            <em>Hazte un espacio.</em>
          </h1>
          <p className="hero-description">
            Descubre negocios, conoce a las personas detrás de cada servicio y
            elige lo que va contigo. Todo empieza por encontrar el lugar
            indicado.
          </p>
          <div className="hero-actions">
            <Link className="button button-primary" to="/businesses">
              Explorar negocios <Arrow />
            </Link>
            <Link className="text-link" to="/register">
              Crear mi cuenta <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="hero-note">
            <span aria-hidden="true">✳</span>
            <span>
              Menos vueltas.
              <br />
              <strong>Más tiempo para ti.</strong>
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-caption">ELIGE CON CALMA</div>
          <div className="art-card">
            <span className="art-card-top">
              TU PRÓXIMO MOMENTO <span>✳</span>
            </span>
            <div className="art-title">
              Un buen día
              <br />
              empieza contigo.
            </div>
            <div className="art-week">
              <span>L</span>
              <span>M</span>
              <span>X</span>
              <span>J</span>
              <span>V</span>
            </div>
            <div className="art-days">
              <span>12</span>
              <span>13</span>
              <span className="selected">14</span>
              <span>15</span>
              <span>16</span>
            </div>
            <div className="art-service">
              <span className="art-icon">✂</span>
              <div>
                <strong>Algo de tiempo para ti</strong>
                <small>El lugar y el equipo adecuados.</small>
              </div>
              <span>↗</span>
            </div>
          </div>
          <div className="art-stamp">
            <span>✦</span>Hecho para
            <br />
            tu día a día.
          </div>
          <div className="art-footer">
            DESCUBRE · CONOCE · ELIGE <span>↗</span>
          </div>
        </div>
      </section>
      <section className="how-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">A TU RITMO</p>
              <h2>El siguiente paso, más simple.</h2>
            </div>
            <p>
              Información clara para tomar
              <br />
              una buena decisión.
            </p>
          </div>
          <div className="steps-grid">
            {[
              {
                number: '01',
                title: 'Encuentra tu lugar',
                text: 'Explora negocios y descubre servicios que encajan con lo que buscas.',
              },
              {
                number: '02',
                title: 'Conoce los detalles',
                text: 'Consulta precios, conoce al equipo y lee experiencias de otros clientes.',
              },
              {
                number: '03',
                title: 'Crea tu espacio',
                text: 'Abre tu cuenta y ten un lugar propio para tus próximas experiencias.',
              },
            ].map((step) => (
              <article key={step.number}>
                <span className="step-number">{step.number}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="container closing-cta">
        <div>
          <p className="eyebrow">EMPIEZA POR DESCUBRIR</p>
          <h2>
            Tu próximo lugar favorito
            <br />
            puede estar aquí.
          </h2>
        </div>
        <Link to="/businesses" className="button button-primary">
          Ver negocios <Arrow />
        </Link>
      </section>
    </>
  );
}
