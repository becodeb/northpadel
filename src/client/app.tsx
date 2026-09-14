import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { FullScreenLoader, RequireAuth } from './lib/auth';
import { EventsPage } from './pages/events-page';
import { LoginPage } from './pages/login-page';

const NewEventPage = lazy(() => import('./pages/new-event-page').then((m) => ({ default: m.NewEventPage })));
const EventLayout = lazy(() => import('./pages/event/event-layout').then((m) => ({ default: m.EventLayout })));
const EventDashboardPage = lazy(() => import('./pages/event/dashboard-page').then((m) => ({ default: m.EventDashboardPage })));
const EventPlayersPage = lazy(() => import('./pages/event/players-page').then((m) => ({ default: m.EventPlayersPage })));
const EventMatchesPage = lazy(() => import('./pages/event/matches-page').then((m) => ({ default: m.EventMatchesPage })));
const EventRankingPage = lazy(() => import('./pages/event/ranking-page').then((m) => ({ default: m.EventRankingPage })));
const EventSettingsPage = lazy(() => import('./pages/event/settings-page').then((m) => ({ default: m.EventSettingsPage })));
const EventLivePage = lazy(() => import('./pages/live-page').then((m) => ({ default: m.EventLivePage })));
const PublicEventPage = lazy(() => import('./pages/public-page').then((m) => ({ default: m.PublicEventPage })));

export function App() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/eventos/:id/live" element={<EventLivePage />} />
        <Route path="/e/:id" element={<PublicEventPage />} />
        <Route
          path="/eventos"
          element={
            <RequireAuth>
              <EventsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/eventos/nuevo"
          element={
            <RequireAuth>
              <NewEventPage />
            </RequireAuth>
          }
        />
        <Route
          path="/eventos/:id"
          element={
            <RequireAuth>
              <EventLayout />
            </RequireAuth>
          }
        >
          <Route index element={<EventDashboardPage />} />
          <Route path="jugadores" element={<EventPlayersPage />} />
          <Route path="partidos" element={<EventMatchesPage />} />
          <Route path="ranking" element={<EventRankingPage />} />
          <Route path="configuracion" element={<EventSettingsPage />} />
          <Route path="canchas" element={<Navigate to=".." replace />} />
        </Route>
        <Route path="/dashboard" element={<Navigate to="/eventos" replace />} />
        <Route path="/" element={<Navigate to="/eventos" replace />} />
        <Route path="*" element={<Navigate to="/eventos" replace />} />
      </Routes>
    </Suspense>
  );
}
