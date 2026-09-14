import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { NorthMark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/primitives';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/eventos" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from !== '/login' ? from : '/eventos', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo ingresar');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
        <div className="mb-10 flex flex-col items-start gap-5">
          <NorthMark size={48} />
          <div>
            <h1 className="text-[28px] font-bold leading-none tracking-tight text-ink">
              North Padel
            </h1>
            <p className="mt-2 text-[15px] text-muted">Panel del organizador · Portal Escobar</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@northpadel.com"
              required
              autoFocus
            />
          </Field>
          <Field label="Contraseña" error={error}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </Field>
          <Button type="submit" size="lg" block loading={loading} className="mt-2">
            Ingresar
          </Button>
        </form>
        <p className="mt-8 text-[13px] text-muted">
          Las pantallas públicas (TV y jugadores) no necesitan cuenta.
        </p>
      </div>
    </div>
  );
}
