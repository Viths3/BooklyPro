import { Link } from 'react-router-dom';
export function NotFoundPage() {
  return (
    <section className="container page not-found">
      <p className="eyebrow">404 · NOS SALIMOS DEL CAMINO</p>
      <h1>Este lugar no existe.</h1>
      <p>Pero tu próximo lugar favorito puede estar a un clic.</p>
      <Link to="/businesses" className="button button-primary">
        Explorar negocios ↗
      </Link>
    </section>
  );
}
