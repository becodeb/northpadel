import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app';
import { AuthProvider } from './lib/auth';
import './styles/globals.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
        <Toaster
          position="top-center"
          offset={64}
          toastOptions={{
            className: '!rounded-2xl !border-0 !bg-ink !text-white !shadow-float',
            duration: 3500,
          }}
        />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
