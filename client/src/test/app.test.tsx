import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from '../App';
import { AuthProvider } from '../features/auth/AuthProvider';
import { SessionManager } from '../features/auth/session';
import { loginSchema, registerSchema } from '../features/auth/schemas';

const user = {
  id: 'user-1',
  firstName: 'Ana',
  lastName: 'Mora',
  email: 'ana@example.com',
  role: 'CUSTOMER',
};
const session = {
  data: { user, accessToken: 'access', refreshToken: 'refresh' },
};
const business = {
  id: 'e3a63b23-dc70-4d42-8011-021e0b3e04a6',
  name: 'Estudio Oliva',
  description: 'Cuidado personal',
  address: 'Quito',
  phone: null,
  imageUrl: null,
  currency: 'USD',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
function setup(path = '/', manager?: SessionManager) {
  const query = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={query}>
      <AuthProvider manager={manager}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
describe('frontend routes and forms', () => {
  it('renders the landing with accessible navigation', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Encuentra tu lugar.',
    );
    expect(
      screen.getByRole('navigation', { name: 'Navegación principal' }),
    ).toBeInTheDocument();
  });
  it('validates login fields before calling the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    setup('/login');
    await userEvent.click(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    );
    expect(
      await screen.findByText('Introduce un correo válido.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Correo electrónico')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('validates register fields and password length', async () => {
    setup('/register');
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));
    expect(await screen.findByText('Introduce tu nombre.')).toBeInTheDocument();
    expect(screen.getByText('Usa al menos 12 caracteres.')).toBeInTheDocument();
  });
  it('matches backend normalization and UTF-8 password rules', () => {
    expect(
      loginSchema.parse({ email: ' ANA@EXAMPLE.COM ', password: 'x' }).email,
    ).toBe('ana@example.com');
    expect(
      registerSchema.safeParse({
        firstName: 'Ana',
        lastName: 'Mora',
        email: 'a@b.com',
        password: 'é'.repeat(37),
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        firstName: 'Ana',
        lastName: 'Mora',
        email: 'a@b.com',
        password: 'x'.repeat(12),
      }).success,
    ).toBe(true);
  });
  it('redirects anonymous dashboard visitors to login', async () => {
    setup('/dashboard');
    expect(
      await screen.findByRole('heading', { name: 'Vuelve a tu espacio.' }),
    ).toBeInTheDocument();
  });
  it('shows session loading until the server verifies me', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(session))
        .mockImplementationOnce(
          () =>
            new Promise<Response>((resolve) => {
              finish = resolve;
            }),
        ),
    );
    const manager = new SessionManager(vi.fn());
    const pending = manager.login({
      email: 'ana@example.com',
      password: 'Password123!',
    });
    setup('/dashboard', manager);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comprobando tu sesión',
    );
    await waitFor(() => expect(finish).toBeDefined());
    await act(async () => {
      finish(json({ data: user }));
      await pending;
    });
    expect(
      screen.getByRole('heading', { name: 'Bienvenido, Ana.' }),
    ).toBeInTheDocument();
  });
  it('allows authenticated users into dashboard after me validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(session))
        .mockResolvedValueOnce(json({ data: user })),
    );
    const manager = new SessionManager(vi.fn());
    await manager.login({ email: 'ana@example.com', password: 'Password123!' });
    setup('/dashboard', manager);
    expect(
      screen.getByRole('heading', { name: 'Bienvenido, Ana.' }),
    ).toBeInTheDocument();
  });
  it('submits login, validates me, and navigates to dashboard', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(session))
      .mockResolvedValueOnce(json({ data: user }));
    vi.stubGlobal('fetch', fetch);
    setup('/login');
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'ana@example.com',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Password123!');
    await userEvent.click(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Bienvenido, Ana.' }),
    ).toBeInTheDocument();
    expect(fetch.mock.calls[1]?.[0]).toContain('/api/auth/me');
  });
  it('registration redirects to login with confirmation, without inventing a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json({ data: user }, 201)),
    );
    setup('/register');
    await userEvent.type(screen.getByLabelText('Nombre'), 'Ana');
    await userEvent.type(screen.getByLabelText('Apellido'), 'Mora');
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'ana@example.com',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'Password123!');
    await userEvent.click(screen.getByRole('button', { name: /Crear cuenta/ }));
    expect(
      await screen.findByText(
        'Tu cuenta está lista. Inicia sesión para continuar.',
      ),
    ).toBeInTheDocument();
  });
  it('renders backend API errors on login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'UNAUTHORIZED',
              message: 'Invalid email or password',
            },
          },
          401,
        ),
      ),
    );
    setup('/login');
    await userEvent.type(
      screen.getByLabelText('Correo electrónico'),
      'ana@example.com',
    );
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong');
    await userEvent.click(
      screen.getByRole('button', { name: 'Iniciar sesión' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No pudimos validar tu sesión',
    );
  });
  it('renders not found route', () => {
    setup('/unknown');
    expect(
      screen.getByRole('heading', { name: 'Este lugar no existe.' }),
    ).toBeInTheDocument();
  });
});
describe('public business queries', () => {
  it('shows loading', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
    setup('/businesses');
    expect(screen.getByRole('status')).toHaveTextContent('Buscando negocios');
  });
  it('shows an error with retry action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: 'SERVER_ERROR',
              message: 'Servicio temporalmente no disponible',
            },
          },
          503,
        ),
      ),
    );
    setup('/businesses');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Servicio temporalmente no disponible',
    );
    expect(
      screen.getByRole('button', { name: 'Volver a intentar' }),
    ).toBeInTheDocument();
  });
  it('shows business data and sends search/pagination query params', async () => {
    const fetch = vi.fn().mockResolvedValue(
      json({
        data: [business],
        pagination: { page: 1, limit: 9, total: 10, totalPages: 2 },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    setup('/businesses?search=Oliva');
    expect(
      await screen.findByRole('heading', { name: 'Estudio Oliva' }),
    ).toBeInTheDocument();
    expect(fetch.mock.calls[0]?.[0]).toContain('search=Oliva');
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente →' }));
    await waitFor(() =>
      expect(fetch.mock.calls.at(-1)?.[0]).toContain('page=2'),
    );
  });
  it('shows an empty state for no results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          data: [],
          pagination: { page: 1, limit: 9, total: 0, totalPages: 0 },
        }),
      ),
    );
    setup('/businesses');
    expect(
      await screen.findByRole('heading', { name: 'Todavía no hay resultados' }),
    ).toBeInTheDocument();
  });
  it('renders detail, services, team and rating summary from their endpoints', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/services'))
          return json({
            data: [
              {
                id: 's',
                name: 'Corte clásico',
                description: null,
                price: '8.00',
                durationMinutes: 30,
              },
            ],
          });
        if (url.endsWith('/employees'))
          return json({
            data: [{ id: 'e', firstName: 'Carlos', lastName: 'Mora' }],
          });
        if (url.includes('/reviews'))
          return json({
            data: [
              {
                id: 'r',
                rating: 5,
                comment: 'Excelente atención',
                createdAt: '2026-10-12T12:00:00Z',
                customer: { firstName: 'Juan' },
              },
            ],
            pagination: { page: 1, limit: 5, total: 1, totalPages: 1 },
            summary: { averageRating: 5, totalReviews: 1 },
          });
        return json({ data: business });
      }),
    );
    setup(`/businesses/${business.id}`);
    expect(
      await screen.findByRole('heading', { name: 'Estudio Oliva' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Corte clásico')).toBeInTheDocument();
    expect(await screen.findByText('Carlos Mora')).toBeInTheDocument();
    expect(await screen.findByText('Excelente atención')).toBeInTheDocument();
    expect(screen.getByText('1 reseñas')).toBeInTheDocument();
  });
});
