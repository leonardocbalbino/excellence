import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { registerSW } from 'virtual:pwa-register';
import { AppProviders } from './app/providers';
import { routes } from './app/routes';
import { createServices } from './lib/services';

const root = document.getElementById('root');
if (!root) throw new Error('Elemento #root não encontrado');

// PWA: o service worker guarda só o app shell e se atualiza sozinho.
registerSW({ immediate: true });

const services = createServices();
const router = createBrowserRouter(routes);

createRoot(root).render(
  <StrictMode>
    <AppProviders services={services}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
