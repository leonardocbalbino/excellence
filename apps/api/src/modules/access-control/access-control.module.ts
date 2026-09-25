import { Module } from '@nestjs/common';
import { MFA_POLICY } from '../auth/domain/mfa-policy';
import { AccessResolver } from './application/access-resolver.service';
import { PermissionCatalogSync } from './application/permission-catalog';
import { RolesService } from './application/roles.service';
import { UserRolesService } from './application/user-roles.service';
import {
  MyAccessController,
  PermissionsController,
  RolesController,
  UserRolesController,
} from './http/access-control.controllers';
import { PermissionGuard } from './http/permission.guard';
import { RoleBasedMfaPolicy } from './infrastructure/role-based-mfa.policy';

/** RBAC: permissões atômicas, perfis configuráveis e escopos (ADR 0007). */
@Module({
  controllers: [PermissionsController, RolesController, UserRolesController, MyAccessController],
  providers: [
    AccessResolver,
    PermissionCatalogSync,
    RolesService,
    UserRolesService,
    PermissionGuard,
    { provide: MFA_POLICY, useClass: RoleBasedMfaPolicy },
  ],
  exports: [AccessResolver, PermissionGuard, MFA_POLICY],
})
export class AccessControlModule {}
