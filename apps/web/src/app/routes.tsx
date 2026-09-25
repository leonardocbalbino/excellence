import type { Permission } from '@excellence/shared';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { RequirePermission } from '@/features/access/require-permission';
import { LoginPage } from '@/features/auth/login-page';
import { MFA_SETUP_PATH, RequireAuth } from '@/features/auth/require-auth';
import { HomePage } from '@/features/home/home-page';
import { NotFoundPage } from './not-found-page';

/**
 * Página carregada sob demanda (um pedaço de JS por módulo) e, se informada, protegida por
 * permissão. A checagem aqui só orienta a interface; quem decide é a API, que nega por padrão.
 */
function page(
  load: () => Promise<ComponentType>,
  permission?: Permission,
): Pick<RouteObject, 'lazy'> {
  return {
    lazy: async () => {
      const Page = await load();
      return {
        element: permission ? (
          <RequirePermission permission={permission}>
            <Page />
          </RequirePermission>
        ) : (
          <Page />
        ),
      };
    },
  };
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          {
            path: MFA_SETUP_PATH.slice(1),
            ...page(
              async () =>
                (await import('@/features/account/account-security-page')).AccountSecurityPage,
            ),
          },
          {
            path: 'acesso/perfis',
            ...page(
              async () => (await import('@/features/roles/roles-page')).RolesPage,
              'roles:read',
            ),
          },
          {
            path: 'acesso/perfis/novo',
            ...page(
              async () => (await import('@/features/roles/role-editor-page')).RoleEditorPage,
              'roles:manage',
            ),
          },
          {
            path: 'acesso/perfis/:id',
            ...page(
              async () => (await import('@/features/roles/role-editor-page')).RoleEditorPage,
              'roles:read',
            ),
          },
          {
            path: 'acesso/usuarios',
            ...page(
              async () => (await import('@/features/roles/users-page')).UsersPage,
              'users:read',
            ),
          },
          {
            path: 'auditoria',
            ...page(
              async () => (await import('@/features/audit/audit-page')).AuditPage,
              'audit:read',
            ),
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
