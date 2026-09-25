import type { Permission } from '@excellence/shared';
import type { ComponentType } from 'react';
import type { RouteObject } from 'react-router';
import { AppShell } from '@/components/layout/app-shell';
import { RequirePermission } from '@/features/access/require-permission';
import { LoginPage } from '@/features/auth/login-page';
import { MFA_SETUP_PATH, PASSWORD_PATH, RequireAuth } from '@/features/auth/require-auth';
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
            path: PASSWORD_PATH.slice(1),
            ...page(
              async () =>
                (await import('@/features/account/change-password-page')).ChangePasswordPage,
            ),
          },
          {
            path: 'pessoas',
            ...page(
              async () => (await import('@/features/workforce/employees-page')).EmployeesPage,
              'employees:read',
            ),
          },
          {
            path: 'pessoas/novo',
            ...page(
              async () =>
                (await import('@/features/workforce/employee-editor-page')).EmployeeEditorPage,
              'employees:manage',
            ),
          },
          {
            path: 'pessoas/importar',
            ...page(
              async () => (await import('@/features/workforce/import-page')).ImportPage,
              'employees:import',
            ),
          },
          {
            path: 'pessoas/:id',
            ...page(
              async () =>
                (await import('@/features/workforce/employee-editor-page')).EmployeeEditorPage,
              'employees:read',
            ),
          },
          {
            path: 'minha-escala',
            ...page(
              async () => (await import('@/features/scheduling/my-schedule-page')).MySchedulePage,
            ),
          },
          {
            path: 'jornada/turnos',
            ...page(
              async () => (await import('@/features/scheduling/shifts-page')).ShiftsPage,
              'schedules:read',
            ),
          },
          {
            path: 'jornada/escalas',
            ...page(
              async () =>
                (await import('@/features/scheduling/work-schedules-page')).WorkSchedulesPage,
              'schedules:read',
            ),
          },
          {
            path: 'jornada/escalas/nova',
            ...page(
              async () =>
                (await import('@/features/scheduling/work-schedule-editor-page'))
                  .WorkScheduleEditorPage,
              'schedules:manage',
            ),
          },
          {
            path: 'jornada/escalas/:id',
            ...page(
              async () =>
                (await import('@/features/scheduling/work-schedule-editor-page'))
                  .WorkScheduleEditorPage,
              'schedules:read',
            ),
          },
          {
            path: 'jornada/feriados',
            ...page(
              async () => (await import('@/features/scheduling/holidays-page')).HolidaysPage,
              'schedules:read',
            ),
          },
          {
            path: 'empresa',
            ...page(
              async () => (await import('@/features/organization/company-page')).CompanyPage,
              'company:manage',
            ),
          },
          {
            path: 'cadastros/unidades',
            ...page(
              async () => (await import('@/features/organization/units-page')).UnitsPage,
              'units:read',
            ),
          },
          {
            path: 'cadastros/unidades/nova',
            ...page(
              async () => (await import('@/features/organization/unit-editor-page')).UnitEditorPage,
              'units:manage',
            ),
          },
          {
            path: 'cadastros/unidades/:id',
            ...page(
              async () => (await import('@/features/organization/unit-editor-page')).UnitEditorPage,
              'units:read',
            ),
          },
          {
            path: 'cadastros/departamentos',
            ...page(
              async () => (await import('@/features/organization/catalogs')).DepartmentsPage,
              'departments:read',
            ),
          },
          {
            path: 'cadastros/cargos',
            ...page(
              async () => (await import('@/features/organization/catalogs')).PositionsPage,
              'positions:read',
            ),
          },
          {
            path: 'cadastros/sindicatos',
            ...page(
              async () => (await import('@/features/organization/catalogs')).UnionsPage,
              'unions:read',
            ),
          },
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
