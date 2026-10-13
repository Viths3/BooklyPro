import {
  ApiError,
  apiRequest,
  type ApiResponse,
  type RequestOptions,
} from '../../api/client';
import {
  sessionSchema,
  userSchema,
  type LoginInput,
  type RegisterInput,
  type User,
} from './schemas';

export type AuthState = {
  status: 'anonymous' | 'loading' | 'authenticated';
  user: User | null;
};
// Tokens live only in this instance. Reloading the document intentionally signs out.
export class SessionManager {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private revision = 0;
  private refreshing: Promise<void> | null = null;
  private state: AuthState = { status: 'anonymous', user: null };
  private listeners = new Set<() => void>();
  constructor(private readonly clearPrivateData: () => void) {}
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private setState(state: AuthState) {
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  private clear() {
    this.revision += 1;
    this.accessToken = null;
    this.refreshToken = null;
    this.refreshing = null;
    this.clearPrivateData();
    this.setState({ status: 'anonymous', user: null });
  }
  async login(input: LoginInput) {
    this.clear();
    const revision = this.revision;
    this.setState({ status: 'loading', user: null });
    try {
      const session = sessionSchema.parse(
        await apiRequest('/api/auth/login', { method: 'POST', body: input }),
      ).data;
      if (revision !== this.revision) return;
      this.accessToken = session.accessToken;
      this.refreshToken = session.refreshToken;
      const user = userSchema.parse(
        (await this.request<ApiResponse<User>>('/api/auth/me')).data,
      );
      if (revision === this.revision)
        this.setState({ status: 'authenticated', user });
    } catch (error) {
      if (revision === this.revision) this.clear();
      throw error;
    }
  }
  register(input: RegisterInput) {
    return apiRequest<ApiResponse<User>>('/api/auth/register', {
      method: 'POST',
      body: input,
    });
  }
  private refresh() {
    if (this.refreshing) return this.refreshing;
    if (!this.refreshToken)
      return Promise.reject(
        new ApiError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.'),
      );
    const revision = this.revision;
    const operation = (async () => {
      try {
        const session = sessionSchema.parse(
          await apiRequest('/api/auth/refresh', {
            method: 'POST',
            body: { refreshToken: this.refreshToken },
          }),
        ).data;
        if (revision !== this.revision)
          throw new ApiError(401, 'UNAUTHORIZED', 'La sesión ha finalizado.');
        this.accessToken = session.accessToken;
        this.refreshToken = session.refreshToken;
        if (this.state.status === 'authenticated')
          this.setState({ status: 'authenticated', user: session.user });
      } catch (error) {
        if (revision === this.revision) this.clear();
        throw error;
      }
    })();
    this.refreshing = operation;
    void operation
      .finally(() => {
        if (this.refreshing === operation) this.refreshing = null;
      })
      .catch(() => {});
    return operation;
  }
  async request<T>(
    path: string,
    options: Omit<RequestOptions, 'token'> = {},
  ): Promise<T> {
    const revision = this.revision;
    const token = this.accessToken;
    if (!token)
      throw new ApiError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
    try {
      const result = await apiRequest<T>(path, { ...options, token });
      if (revision !== this.revision)
        throw new ApiError(401, 'UNAUTHORIZED', 'La sesión ha finalizado.');
      return result;
    } catch (error) {
      if (
        !(error instanceof ApiError) ||
        error.status !== 401 ||
        revision !== this.revision
      )
        throw error;
      // A late 401 from the old token must not rotate an already rotated refresh token.
      if (token === this.accessToken) await this.refresh();
      if (!this.accessToken || revision !== this.revision) throw error;
      try {
        const result = await apiRequest<T>(path, {
          ...options,
          token: this.accessToken,
        });
        if (revision !== this.revision)
          throw new ApiError(401, 'UNAUTHORIZED', 'La sesión ha finalizado.');
        return result;
      } catch (retryError) {
        if (
          retryError instanceof ApiError &&
          retryError.status === 401 &&
          revision === this.revision
        )
          this.clear();
        throw retryError;
      }
    }
  }
  async logout() {
    // Wait for an in-flight rotation so logout revokes the latest refresh family.
    const revision = this.revision;
    try {
      await this.refreshing;
    } catch {
      /* Refresh already cleared the session. */
    }
    if (revision !== this.revision) return;
    const refreshToken = this.refreshToken;
    this.clear();
    if (refreshToken)
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: { refreshToken },
      });
  }
}
