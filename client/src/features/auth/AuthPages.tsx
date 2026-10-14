import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ApiError } from '../../api/client';
import { useAuth } from './AuthProvider';
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from './schemas';
import { Button, ErrorMessage, Input } from '../../components/common/ui';
import { safeReturnTo } from './returnTo';

function AuthAside() {
  return (
    <aside className="auth-aside">
      <p className="eyebrow">BOOKLYPRO</p>
      <h2>Tu agenda empieza aquí.</h2>
      <p>
        Reserva con los negocios que eliges y consulta tus citas desde tu
        cuenta.
      </p>
      <ul className="auth-benefits">
        <li>Horarios disponibles al reservar</li>
        <li>Historial de citas y reseñas</li>
        <li>Un panel para gestionar tu negocio</li>
      </ul>
    </aside>
  );
}
export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state: unknown = location.state;
  const returnTo = safeReturnTo(state);
  const notice =
    typeof state === 'object' &&
    state !== null &&
    'notice' in state &&
    typeof state.notice === 'string'
      ? state.notice
      : null;
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  async function submit(input: LoginInput) {
    setError(null);
    try {
      await session.login(input);
      navigate(returnTo ?? '/dashboard', { replace: true });
    } catch (error) {
      setError(error);
    }
  }
  return (
    <div className="container auth-shell">
      <AuthAside />
      <section className="auth-form-panel">
        <p className="eyebrow">QUÉ BUENO VERTE</p>
        <h1>Vuelve a tu espacio.</h1>
        <p className="muted">Inicia sesión para continuar con tu cuenta.</p>
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        <form onSubmit={handleSubmit(submit)} noValidate>
          {error !== null && <ErrorMessage error={error} />}
          <Input
            required
            id="login-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            required
            id="login-password"
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            error={errors.password?.message}
          />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Iniciando sesión…' : 'Iniciar sesión'}{' '}
            <span aria-hidden="true">→</span>
          </Button>
        </form>
        <p className="auth-switch">
          ¿Aún no tienes cuenta?{' '}
          <Link to="/register" state={{ returnTo }}>
            Crea una cuenta
          </Link>
        </p>
      </section>
    </div>
  );
}
export function RegisterPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const returnTo = safeReturnTo(useLocation().state);
  const [error, setError] = useState<unknown>(null);
  const {
    register,
    handleSubmit,
    setError: fieldError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });
  async function submit(input: RegisterInput) {
    setError(null);
    try {
      await session.register(input);
      navigate('/login', {
        replace: true,
        state: {
          returnTo,
          notice: 'Tu cuenta está lista. Inicia sesión para continuar.',
        },
      });
    } catch (error) {
      setError(error);
      if (error instanceof ApiError)
        for (const detail of error.details ?? []) {
          if (
            detail.field === 'firstName' ||
            detail.field === 'lastName' ||
            detail.field === 'email' ||
            detail.field === 'password'
          )
            fieldError(detail.field, { message: detail.message });
        }
    }
  }
  return (
    <div className="container auth-shell">
      <AuthAside />
      <section className="auth-form-panel">
        <p className="eyebrow">TU TIEMPO MERECE UN LUGAR</p>
        <h1>Empieza por ti.</h1>
        <p className="muted">Crea tu cuenta en BooklyPro.</p>
        <form onSubmit={handleSubmit(submit)} noValidate>
          {error !== null && <ErrorMessage error={error} />}
          <div className="form-row">
            <Input
              required
              id="first-name"
              label="Nombre"
              autoComplete="given-name"
              {...register('firstName')}
              error={errors.firstName?.message}
            />
            <Input
              required
              id="last-name"
              label="Apellido"
              autoComplete="family-name"
              {...register('lastName')}
              error={errors.lastName?.message}
            />
          </div>
          <Input
            required
            id="register-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
            required
            id="register-password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            hint="Al menos 12 caracteres; máximo 72 bytes UTF-8."
            {...register('password')}
            error={errors.password?.message}
          />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Creando tu cuenta…' : 'Crear cuenta'}{' '}
            <span aria-hidden="true">→</span>
          </Button>
        </form>
        <p className="auth-switch">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" state={{ returnTo }}>
            Inicia sesión
          </Link>
        </p>
      </section>
    </div>
  );
}
