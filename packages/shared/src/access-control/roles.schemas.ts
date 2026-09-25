import { z } from 'zod';
import { permissionSchema, roleScopeSchema } from './permissions.js';

export const permissionInfoSchema = z.object({
  key: permissionSchema,
  resource: z.string(),
  action: z.string(),
  description: z.string(),
  sensitive: z.boolean(),
});
export type PermissionInfo = z.infer<typeof permissionInfoSchema>;

export const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** Perfis padrão criados com a empresa: podem ser editados, não excluídos. */
  isSystem: z.boolean(),
  /** Exige MFA de quem tem este perfil. */
  requiresMfa: z.boolean(),
  permissions: z.array(permissionSchema),
  scopes: z.array(roleScopeSchema),
  userCount: z.number().int(),
});
export type Role = z.infer<typeof roleSchema>;

const uniqueArray = <T extends z.ZodType>(item: T, message: string) =>
  z
    .array(item)
    .refine(
      (values) => new Set(values.map((v) => JSON.stringify(v))).size === values.length,
      message,
    );

export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).nullable().default(null),
  requiresMfa: z.boolean().default(false),
  permissions: uniqueArray(permissionSchema, 'Permissão repetida'),
  scopes: uniqueArray(roleScopeSchema, 'Escopo repetido').min(1, 'Informe ao menos um escopo'),
});
export type RoleInput = z.input<typeof roleInputSchema>;

export const roleIdParamSchema = z.uuid();

export const userWithRolesSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  mfaEnabled: z.boolean(),
  roles: z.array(z.object({ id: z.uuid(), name: z.string() })),
});
export type UserWithRoles = z.infer<typeof userWithRolesSchema>;

export const assignRolesInputSchema = z.object({
  roleIds: uniqueArray(z.uuid(), 'Perfil repetido'),
});
export type AssignRolesInput = z.input<typeof assignRolesInputSchema>;

/** Permissões efetivas do usuário logado, para o web montar menus e rotas. */
export const myAccessSchema = z.object({
  permissions: z.array(permissionSchema),
  /** O perfil exige MFA e o usuário ainda não ativou: o acesso fica bloqueado até ativar. */
  mfaSetupRequired: z.boolean(),
  /** Senha temporária: o acesso fica bloqueado até a troca. */
  passwordChangeRequired: z.boolean(),
});
export type MyAccess = z.infer<typeof myAccessSchema>;
