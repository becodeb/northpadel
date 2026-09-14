import { LogOut, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { Wordmark } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { realtime, type ConnectionStatus } from '@/lib/ws';
import { initials } from '@/lib/format';

export function useConnectionStatus(): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(realtime.getStatus());
  useEffect(() => {
    realtime.start();
    setStatus(realtime.getStatus());
    return realtime.onStatus(setStatus);
  }, []);
  return status;
}

export function SyncDot({ pending, syncing }: { pending?: number; syncing?: boolean }) {
  const status = useConnectionStatus();
  const offline = status === 'offline';
  const label = offline
    ? pending
      ? `Sin conexión · ${pending} cambio${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'}`
      : 'Sin conexión'
    : syncing || pending
      ? 'Sincronizando…'
      : status === 'connecting'
        ? 'Conectando…'
        : 'En vivo';
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-muted" title={label}>
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          offline ? 'bg-magenta' : syncing || pending || status === 'connecting' ? 'bg-amber animate-pulse-soft' : 'bg-north',
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function AppShell({ children, title, actions, back }: { children: ReactNode; title?: ReactNode; actions?: ReactNode; back?: string }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="safe-top sticky top-0 z-30 border-b border-line-2 bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 md:px-6">
          <Link to="/eventos" className="press flex items-center">
            <Wordmark compact />
          </Link>
          {title && (
            <div className="ml-2 hidden min-w-0 items-center gap-2 text-sm md:flex">
              <span className="text-muted-2">/</span>
              <span className="truncate font-medium text-ink">{title}</span>
            </div>
          )}
          <nav className="ml-auto flex items-center gap-1">
            {actions}
            <NavLink
              to="/eventos/nuevo"
              className={({ isActive }) => cn('hidden md:inline-flex', isActive && 'pointer-events-none opacity-50')}
            >
              <Button variant="primary" size="sm">
                <Plus className="h-4 w-4" />
                Nuevo evento
              </Button>
            </NavLink>
            {user && (
              <Menu>
                <MenuTrigger asChild>
                  <button className="press focus-ring ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white">
                    {initials(user.name)}
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuLabel>{user.email}</MenuLabel>
                  <MenuItem
                    icon={<LogOut />}
                    onSelect={() => {
                      void logout().then(() => navigate('/login'));
                    }}
                  >
                    Cerrar sesión
                  </MenuItem>
                </MenuContent>
              </Menu>
            )}
          </nav>
        </div>
      </header>
      <main className={cn('mx-auto max-w-6xl px-4 pb-24 pt-5 md:px-6 md:pb-12', back && 'pt-4')}>{children}</main>
    </div>
  );
}
