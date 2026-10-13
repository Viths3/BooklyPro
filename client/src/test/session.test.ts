import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from '../features/auth/session';
import { apiRequest, ApiError } from '../api/client';
const user = {
  id: 'u',
  firstName: 'Ana',
  lastName: 'Mora',
  email: 'ana@example.com',
  role: 'CUSTOMER',
};
const session = (token = 'initial') => ({
  data: { user, accessToken: token, refreshToken: `${token}-refresh` },
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const unauthorized = () =>
  json({ error: { code: 'UNAUTHORIZED', message: 'Expired' } }, 401);
const credentials = { email: user.email, password: 'Password123!' };
describe('in-memory auth and transport', () => {
  it('shares one refresh across concurrent expired requests and uses the new access token', async () => {
    const fetch = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/login')) return json(session());
      if (url.endsWith('/me')) return json({ data: user });
      if (url.endsWith('/refresh')) return json(session('rotated'));
      return new Headers(options?.headers).get('Authorization') ===
        'Bearer rotated'
        ? json({ data: 'ok' })
        : unauthorized();
    });
    vi.stubGlobal('fetch', fetch);
    const manager = new SessionManager(vi.fn());
    await manager.login(credentials);
    const results = await Promise.all([
      manager.request('/api/private/a'),
      manager.request('/api/private/b'),
    ]);
    expect(results).toEqual([{ data: 'ok' }, { data: 'ok' }]);
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith('/refresh')),
    ).toHaveLength(1);
    const rotation = fetch.mock.calls.find(([url]) => url.endsWith('/refresh'));
    expect(JSON.parse(String(rotation?.[1]?.body))).toEqual({
      refreshToken: 'initial-refresh',
    });
  });
  it('failed refresh clears user and cached private data without a loop', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/login')
        ? json(session())
        : url.endsWith('/me')
          ? json({ data: user })
          : unauthorized(),
    );
    vi.stubGlobal('fetch', fetch);
    const clear = vi.fn();
    const manager = new SessionManager(clear);
    await manager.login(credentials);
    clear.mockClear();
    await expect(manager.request('/api/private')).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(manager.getSnapshot()).toEqual({ status: 'anonymous', user: null });
    expect(clear).toHaveBeenCalledOnce();
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith('/refresh')),
    ).toHaveLength(1);
  });
  it('a second 401 after refresh ends the session and never refreshes again', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/login')
        ? json(session())
        : url.endsWith('/me')
          ? json({ data: user })
          : url.endsWith('/refresh')
            ? json(session('rotated'))
            : unauthorized(),
    );
    vi.stubGlobal('fetch', fetch);
    const manager = new SessionManager(vi.fn());
    await manager.login(credentials);
    await expect(manager.request('/api/private')).rejects.toMatchObject({
      status: 401,
    });
    expect(manager.getSnapshot().user).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(5);
  });
  it('verifies me before trusting a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/login') ? json(session()) : unauthorized(),
      ),
    );
    const manager = new SessionManager(vi.fn());
    await expect(manager.login(credentials)).rejects.toBeInstanceOf(ApiError);
    expect(manager.getSnapshot().user).toBeNull();
  });
  it('logout posts the refresh token, accepts 204 and clears session and queries', async () => {
    const fetch = vi.fn(async (url: string) =>
      url.endsWith('/login')
        ? json(session())
        : url.endsWith('/me')
          ? json({ data: user })
          : new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetch);
    const clear = vi.fn();
    const manager = new SessionManager(clear);
    await manager.login(credentials);
    clear.mockClear();
    await manager.logout();
    expect(manager.getSnapshot().status).toBe('anonymous');
    expect(clear).toHaveBeenCalledOnce();
    expect(fetch.mock.calls.at(-1)?.[0]).toContain('/api/auth/logout');
  });
  it('logout failure still clears local authentication', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/login')) return json(session());
        if (url.endsWith('/me')) return json({ data: user });
        throw new TypeError('offline');
      }),
    );
    const manager = new SessionManager(vi.fn());
    await manager.login(credentials);
    await expect(manager.logout()).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(manager.getSnapshot().user).toBeNull();
  });
  it('late private responses cannot return data after logout', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/login')) return json(session());
        if (url.endsWith('/me')) return json({ data: user });
        if (url.endsWith('/logout')) return new Response(null, { status: 204 });
        return new Promise<Response>((resolve) => {
          finish = resolve;
        });
      }),
    );
    const manager = new SessionManager(vi.fn());
    await manager.login(credentials);
    const pending = manager.request('/api/private');
    await manager.logout();
    finish(json({ data: 'private' }));
    await expect(pending).rejects.toMatchObject({ status: 401 });
  });
  it('does not persist either token in browser storage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.endsWith('/login') ? json(session()) : json({ data: user }),
      ),
    );
    const manager = new SessionManager(vi.fn());
    await manager.login(credentials);
    expect(setItem).not.toHaveBeenCalled();
    expect(new SessionManager(vi.fn()).getSnapshot().status).toBe('anonymous');
  });
  it('transport parses field errors and handles non-JSON server errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json(
            {
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Invalid data',
                details: [{ field: 'email', message: 'Invalid email' }],
              },
            },
            400,
          ),
        )
        .mockResolvedValueOnce(new Response('bad gateway', { status: 502 })),
    );
    await expect(apiRequest('/api/test')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      details: [{ field: 'email', message: 'Invalid email' }],
    });
    await expect(apiRequest('/api/test')).rejects.toMatchObject({
      status: 502,
      code: 'SERVER_ERROR',
    });
  });
});
