import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  assignRolesInputSchema,
  type MyAccess,
  myAccessSchema,
  type Permission,
  PERMISSIONS,
  type PermissionInfo,
  permissionInfoSchema,
  type Role,
  roleIdParamSchema,
  roleInputSchema,
  roleSchema,
  type UserWithRoles,
  userWithRolesSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodResponse } from '../../../common/openapi/zod-openapi';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { permissionParts } from '../application/permission-catalog';
import { RolesService } from '../application/roles.service';
import { UserMfaService } from '../application/user-mfa.service';
import { UserRolesService } from '../application/user-roles.service';
import { Access, type AccessGrant, AnyAuthenticated, RequirePermission } from './access.decorators';

@ApiTags('access-control')
@ApiBearerAuth()
@Controller('permissions')
export class PermissionsController {
  @Get()
  @RequirePermission('roles:read')
  @ApiOperation({ summary: 'Catálogo de permissões atômicas' })
  @ZodResponse(HttpStatus.OK, z.array(permissionInfoSchema))
  list(): PermissionInfo[] {
    return (Object.keys(PERMISSIONS) as Permission[]).map((key) => ({
      key,
      ...permissionParts(key),
      ...PERMISSIONS[key],
    }));
  }
}

@ApiTags('access-control')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('roles:read')
  @ApiOperation({ summary: 'Perfis da empresa' })
  @ZodResponse(HttpStatus.OK, z.array(roleSchema))
  list(): Promise<Role[]> {
    return this.roles.list();
  }

  @Get(':id')
  @RequirePermission('roles:read')
  @ZodResponse(HttpStatus.OK, roleSchema)
  get(@ZodParam('id', roleIdParamSchema) id: string): Promise<Role> {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermission('roles:manage')
  @ApiOperation({ summary: 'Cria perfil com permissões e escopos' })
  @ZodResponse(HttpStatus.CREATED, roleSchema)
  create(
    @ZodBody(roleInputSchema) body: z.output<typeof roleInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Role> {
    return this.roles.create(body, grant);
  }

  @Put(':id')
  @RequirePermission('roles:manage')
  @ApiOperation({ summary: 'Substitui nome, permissões, escopos e exigência de MFA do perfil' })
  @ZodResponse(HttpStatus.OK, roleSchema)
  update(
    @ZodParam('id', roleIdParamSchema) id: string,
    @ZodBody(roleInputSchema) body: z.output<typeof roleInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<Role> {
    return this.roles.update(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('roles:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @ZodParam('id', roleIdParamSchema) id: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.roles.remove(id, grant);
  }
}

@ApiTags('access-control')
@ApiBearerAuth()
@Controller('users')
export class UserRolesController {
  constructor(
    private readonly userRoles: UserRolesService,
    private readonly userMfa: UserMfaService,
  ) {}

  @Get()
  @RequirePermission('users:read')
  @ApiOperation({ summary: 'Usuários da empresa com seus perfis' })
  @ZodResponse(HttpStatus.OK, z.array(userWithRolesSchema))
  list(): Promise<UserWithRoles[]> {
    return this.userRoles.list();
  }

  @Put(':id/roles')
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Define os perfis do usuário' })
  @ZodResponse(HttpStatus.OK, userWithRolesSchema)
  assign(
    @ZodParam('id', z.uuid()) id: string,
    @ZodBody(assignRolesInputSchema) body: z.output<typeof assignRolesInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<UserWithRoles> {
    return this.userRoles.assign(id, body.roleIds, grant);
  }

  @Post(':id/mfa/reset')
  @RequirePermission('users:reset_mfa')
  @ApiOperation({
    summary: 'Redefine o MFA de outro usuário (perdeu o celular) e encerra as sessões dele',
  })
  @ZodResponse(HttpStatus.CREATED, userWithRolesSchema)
  resetMfa(
    @ZodParam('id', z.uuid()) id: string,
    @Access() grant: AccessGrant,
  ): Promise<UserWithRoles> {
    return this.userMfa.reset(id, grant);
  }
}

@ApiTags('access-control')
@ApiBearerAuth()
@Controller('me')
export class MyAccessController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('access')
  @AnyAuthenticated({ allowPendingSetup: true })
  @ApiOperation({ summary: 'Permissões efetivas do usuário logado' })
  @ZodResponse(HttpStatus.OK, myAccessSchema)
  async myAccess(@Access() grant: AccessGrant): Promise<MyAccess> {
    const access = grant.access;
    // Rota liberada antes do MFA/troca de senha: filtra a empresa explicitamente.
    const employee = await this.prisma.employee.findFirst({
      where: { userId: grant.userId, companyId: grant.companyId },
      select: { id: true },
    });
    const patrolRoutes = employee
      ? await this.prisma.patrolRouteAssignee.count({
          where: {
            companyId: grant.companyId,
            employeeId: employee.id,
            route: { isActive: true },
          },
        })
      : 0;
    return {
      permissions: access ? [...access.permissions.keys()].sort() : [],
      hasEmployeeRecord: employee !== null,
      hasPatrolRoutes: patrolRoutes > 0,
      mfaSetupRequired: access ? access.mfaRequired && !access.mfaEnabled : false,
      passwordChangeRequired: access?.passwordChangeRequired ?? false,
    };
  }
}
