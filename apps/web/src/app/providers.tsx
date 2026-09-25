import { type QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { Toaster } from 'sonner';
import { createQueryClient } from '@/lib/query-client';
import type { Services } from '@/lib/services';
import { ServicesProvider } from '@/lib/services-provider';

export function AppProviders({
  services,
  queryClient,
  children,
}: {
  services: Services;
  queryClient?: QueryClient;
  children: ReactNode;
}) {
  const [client] = useState(() => queryClient ?? createQueryClient());

  useEffect(() => {
    // Retoma a sessão pelo cookie do refresh token ao abrir o app.
    void services.session.restore();
  }, [services]);

  return (
    <ServicesProvider services={services}>
      <QueryClientProvider client={client}>
        {children}
        <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ServicesProvider>
  );
}
