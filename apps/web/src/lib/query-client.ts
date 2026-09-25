import { ApiError } from '@excellence/shared';
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Erros 4xx não melhoram tentando de novo.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
