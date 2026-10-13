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
import { safeBookingReturn } from '../booking/model';

function AuthAside() {
  return (
    <aside className="auth-aside">
      <p className="eyebrow">BOOKLYPRO</p>
      <h2>
        Un poco más
        <br />
        de tiempo.
        <br />
        <em>Para lo tuyo.</em>
      </h2>
      <p>Encuentra personas y servicios que hacen que tu día sea mejor.</p>
      <span className="auth-flower" aria-hidden="true">
        ✳
      </span>
    </aside>
  );
}
export function LoginPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state: unknown = location.state;
  const returnTo = safeBookingReturn(state);
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
            id="login-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
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
  const returnTo = safeBookingReturn(useLocation().state);
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
              id="first-name"
              label="Nombre"
              autoComplete="given-name"
              {...register('firstName')}
              error={errors.firstName?.message}
            />
            <Input
              id="last-name"
              label="Apellido"
              autoComplete="family-name"
              {...register('lastName')}
              error={errors.lastName?.message}
            />
          </div>
          <Input
            id="register-email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            {...register('email')}
            error={errors.email?.message}
          />
          <Input
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
