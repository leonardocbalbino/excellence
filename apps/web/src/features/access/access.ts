import type { MyAccess, Permission } from '@excellence/shared';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApi, useSession } from '@/lib/services';

export const myAccessQueryKey = ['me', 'access'] as const;

/** Permissões efetivas do usuário logado (a API é quem decide; isto só guia a interface). */
export function useMyAccess(): UseQueryResult<MyAccess> {
  const api = useApi();
  const session = useSession();
  return useQuery({
    queryKey: myAccessQueryKey,
    queryFn: () => api.access.mine(),
    enabled: session.status === 'authenticated',
    staleTime: 60_000,
  });
}

export function useCan(permission: Permission): boolean {
  const { data } = useMyAccess();
  return data?.permissions.includes(permission) ?? false;
}
