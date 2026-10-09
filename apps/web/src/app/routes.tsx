import type { Permission } from '@excellence/shared';
import type { ComponentType, ReactNode } from 'react';
import { Navigate, type RouteObject } from 'react-router';
import { AppShell, type RouteHandle } from '@/components/layout/app-shell';
import { RequireEmployeeRecord, RequireManagementArea } from '@/features/access/require-area';
import { RequirePermission } from '@/features/access/require-permission';
import { LoginPage } from '@/features/auth/login-page';
import { MFA_SETUP_PATH, PASSWORD_PATH, RequireAuth } from '@/features/auth/require-auth';
import { HomeEntry } from '@/features/home/home-entry';
import { NotFoundPage } from './not-found-page';

type Load = () => Promise<ComponentType>;

/**
 * Página carregada sob demanda (um pedaço de JS por módulo). A checagem de permissão aqui
 * só orienta a interface; quem decide é a API, que nega por padrão.
 */
function lazyPage(load: Load, wrap: (page: ReactNode) => ReactNode = (p) => p) {
  return async () => {
    const Page = await load();
    return { element: wrap(<Page />) };
  };
}

/** Área pessoal: só para quem tem cadastro de funcionário (bate ponto, tem escala). */
function personal(path: string, load: Load): RouteObject {
  return {
    path,
    handle: { area: 'personal' } satisfies RouteHandle,
    lazy: lazyPage(load, (page) => <RequireEmployeeRecord>{page}</RequireEmployeeRecord>),
  };
}

/** Área de gestão: dados dos outros funcionários, no escopo da permissão. */
function management(path: string, load: Load, permission?: Permission): RouteObject {
  return {
    path,
    handle: { area: 'management' } satisfies RouteHandle,
    lazy: lazyPage(load, (page) =>
      permission ? (
        <RequirePermission permission={permission}>{page}</RequirePermission>
      ) : (
        <RequireManagementArea>{page}</RequireManagementArea>
      ),
    ),
  };
}

/** Comum às duas áreas (conta, comprovante): usa a área principal do usuário. */
function shared(path: string, load: Load): RouteObject {
  return { path, lazy: lazyPage(load) };
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            handle: { area: 'personal' } satisfies RouteHandle,
            element: <HomeEntry />,
          },

          // ─── Área pessoal ───
          personal(
            'ponto',
            async () => (await import('@/features/time-tracking/clock-page')).ClockPage,
          ),
          personal(
            'ponto/espelho',
            async () =>
              (await import('@/features/time-tracking/my-timesheet-page')).MyTimesheetPage,
          ),
          personal(
            'rondas',
            async () => (await import('@/features/patrols/my-patrols-page')).MyPatrolsPage,
          ),
          personal(
            'minha-escala',
            async () => (await import('@/features/scheduling/my-schedule-page')).MySchedulePage,
          ),
          personal(
            'meus-atestados',
            async () =>
              (await import('@/features/medical/my-certificates-page')).MyCertificatesPage,
          ),
          personal(
            'minha-folha',
            async () => (await import('@/features/payroll/my-payroll-page')).MyPayrollPage,
          ),
          // Links úteis valem para todos; os benefícios aparecem para quem tem cadastro.
          {
            path: 'beneficios',
            handle: { area: 'personal' } satisfies RouteHandle,
            lazy: lazyPage(
              async () => (await import('@/features/benefits/my-benefits-page')).MyBenefitsPage,
            ),
          },
          // Comunicados valem também para quem não tem cadastro (ex.: Administrador, ADR 0014):
          // área pessoal para funcionários, sem exigir o cadastro.
          {
            path: 'comunicados',
            handle: { area: 'personal' } satisfies RouteHandle,
            lazy: lazyPage(
              async () =>
                (await import('@/features/announcements/my-announcements-page'))
                  .MyAnnouncementsPage,
            ),
          },

          // Endereço antigo do espelho (antes ficava no menu como "Meu ponto").
          { path: 'meu-ponto', element: <Navigate to="/ponto/espelho" replace /> },
          // "Unidades" viraram "Postos de trabalho" (ADR 0018).
          { path: 'cadastros/unidades', element: <Navigate to="/cadastros/postos" replace /> },

          // ─── Comuns ───
          shared(
            'ponto/comprovante/:id',
            async () => (await import('@/features/time-tracking/receipt-page')).ReceiptPage,
          ),
          shared(
            PASSWORD_PATH.slice(1),
            async () =>
              (await import('@/features/account/change-password-page')).ChangePasswordPage,
          ),
          shared(
            'perfil',
            async () => (await import('@/features/account/profile-page')).ProfilePage,
          ),
          shared(
            MFA_SETUP_PATH.slice(1),
            async () =>
              (await import('@/features/account/account-security-page')).AccountSecurityPage,
          ),

          // ─── Gestão ───
          management(
            'gestao',
            async () => (await import('@/features/overview/overview-page')).OverviewPage,
          ),
          management(
            'gestao/folha',
            async () => (await import('@/features/payroll/payroll-page')).PayrollPage,
            'payroll:manage',
          ),
          management(
            'gestao/folha/:id',
            async () => (await import('@/features/payroll/payroll-period-page')).PayrollPeriodPage,
            'payroll:manage',
          ),
          management(
            'gestao/beneficios',
            async () =>
              (await import('@/features/benefits/benefits-catalog-page')).BenefitsCatalogPage,
            'benefits:manage',
          ),
          management(
            'gestao/links',
            async () => (await import('@/features/benefits/useful-links-page')).UsefulLinksPage,
            'useful_links:manage',
          ),
          management(
            'gestao/rondas',
            async () => (await import('@/features/patrols/patrol-board-page')).PatrolBoardPage,
            'patrols:read',
          ),
          management(
            'gestao/rondas/:id',
            async () => (await import('@/features/patrols/patrol-run-page')).PatrolRunPage,
            'patrols:read',
          ),
          management(
            'gestao/rondas/pontos',
            async () => (await import('@/features/patrols/patrol-points-page')).PatrolPointsPage,
            'patrols:manage',
          ),
          management(
            'gestao/rondas/pontos/imprimir',
            async () => (await import('@/features/patrols/patrol-codes-page')).PatrolCodesPage,
            'patrols:manage',
          ),
          management(
            'gestao/rondas/rotas',
            async () => (await import('@/features/patrols/patrol-routes-page')).PatrolRoutesPage,
            'patrols:manage',
          ),
          management(
            'gestao/rondas/rotas/nova',
            async () =>
              (await import('@/features/patrols/patrol-route-editor-page')).PatrolRouteEditorPage,
            'patrols:manage',
          ),
          management(
            'gestao/rondas/rotas/:id',
            async () =>
              (await import('@/features/patrols/patrol-route-editor-page')).PatrolRouteEditorPage,
            'patrols:manage',
          ),
          management(
            'gestao/ponto',
            async () =>
              (await import('@/features/time-tracking/daily-attendance-page')).DailyAttendancePage,
            'time_entries:read',
          ),
          management(
            'pessoas',
            async () => (await import('@/features/workforce/employees-page')).EmployeesPage,
            'employees:read',
          ),
          management(
            'pessoas/novo',
            async () =>
              (await import('@/features/workforce/employee-editor-page')).EmployeeEditorPage,
            'employees:manage',
          ),
          management(
            'pessoas/importar',
            async () => (await import('@/features/workforce/import-page')).ImportPage,
            'employees:import',
          ),
          management(
            'pessoas/:id',
            async () =>
              (await import('@/features/workforce/employee-editor-page')).EmployeeEditorPage,
            'employees:read',
          ),
          management(
            'pessoas/:id/espelho',
            async () =>
              (await import('@/features/time-tracking/employee-timesheet-page'))
                .EmployeeTimesheetPage,
            'time_entries:read',
          ),
          management(
            'pessoas/:id/atestado',
            async () =>
              (await import('@/features/medical/employee-certificate-page'))
                .EmployeeCertificatePage,
            'medical_certificates:manage',
          ),
          management(
            'ponto/ajustes',
            async () => (await import('@/features/time-tracking/approvals-page')).ApprovalsPage,
            'time_adjustments:approve',
          ),
          management(
            'atestados',
            async () => (await import('@/features/medical/certificates-page')).CertificatesPage,
            'medical_certificates:read',
          ),
          management(
            'gestao/comunicados',
            async () =>
              (await import('@/features/announcements/announcements-page')).AnnouncementsPage,
            'announcements:manage',
          ),
          management(
            'gestao/comunicados/novo',
            async () =>
              (await import('@/features/announcements/announcement-editor-page'))
                .AnnouncementEditorPage,
            'announcements:manage',
          ),
          management(
            'gestao/comunicados/:id',
            async () =>
              (await import('@/features/announcements/announcement-editor-page'))
                .AnnouncementEditorPage,
            'announcements:manage',
          ),
          management(
            'jornada/turnos',
            async () => (await import('@/features/scheduling/shifts-page')).ShiftsPage,
            'schedules:read',
          ),
          management(
            'jornada/escalas',
            async () =>
              (await import('@/features/scheduling/work-schedules-page')).WorkSchedulesPage,
            'schedules:read',
          ),
          management(
            'jornada/escalas/nova',
            async () =>
              (await import('@/features/scheduling/work-schedule-editor-page'))
                .WorkScheduleEditorPage,
            'schedules:manage',
          ),
          management(
            'jornada/escalas/:id',
            async () =>
              (await import('@/features/scheduling/work-schedule-editor-page'))
                .WorkScheduleEditorPage,
            'schedules:read',
          ),
          management(
            'jornada/feriados',
            async () => (await import('@/features/scheduling/holidays-page')).HolidaysPage,
            'schedules:read',
          ),
          management(
            'empresa',
            async () => (await import('@/features/organization/company-page')).CompanyPage,
            'company:manage',
          ),
          management(
            'cadastros/postos',
            async () => (await import('@/features/organization/units-page')).UnitsPage,
            'units:read',
          ),
          management(
            'cadastros/postos/novo',
            async () => (await import('@/features/organization/unit-editor-page')).UnitEditorPage,
            'units:manage',
          ),
          management(
            'cadastros/postos/:id',
            async () => (await import('@/features/organization/unit-editor-page')).UnitEditorPage,
            'units:read',
          ),
          management(
            'cadastros/departamentos',
            async () => (await import('@/features/organization/catalogs')).DepartmentsPage,
            'departments:read',
          ),
          management(
            'cadastros/cargos',
            async () => (await import('@/features/organization/catalogs')).PositionsPage,
            'positions:read',
          ),
          management(
            'cadastros/sindicatos',
            async () => (await import('@/features/organization/catalogs')).UnionsPage,
            'unions:read',
          ),
          management(
            'acesso/perfis',
            async () => (await import('@/features/roles/roles-page')).RolesPage,
            'roles:read',
          ),
          management(
            'acesso/perfis/novo',
            async () => (await import('@/features/roles/role-editor-page')).RoleEditorPage,
            'roles:manage',
          ),
          management(
            'acesso/perfis/:id',
            async () => (await import('@/features/roles/role-editor-page')).RoleEditorPage,
            'roles:read',
          ),
          management(
            'acesso/usuarios',
            async () => (await import('@/features/roles/users-page')).UsersPage,
            'users:read',
          ),
          management(
            'auditoria',
            async () => (await import('@/features/audit/audit-page')).AuditPage,
            'audit:read',
          ),
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
