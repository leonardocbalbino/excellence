import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/routes';
import { createQueryClient } from '@/lib/query-client';
import { createServices } from '@/lib/services';
import { API } from './server';

/** Renderiza o app completo (rotas reais) começando em `path`. */
export function renderApp(path = '/') {
  const services = createServices(API);
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const result = render(
    <AppProviders services={services} queryClient={createQueryClient()}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  onTestFinished(() => services.session.dispose());
  return { ...result, router, services };
}
