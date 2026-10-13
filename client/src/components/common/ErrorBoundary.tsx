import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="container page">
          <h1>No pudimos mostrar esta página.</h1>
          <p>Recarga la aplicación para volver a intentarlo.</p>
          <a className="button button-primary" href="/">
            Volver al inicio
          </a>
        </main>
      );
    return this.props.children;
  }
}
