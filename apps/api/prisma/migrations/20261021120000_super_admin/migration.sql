-- Conta de desenvolvedor com acesso total (super admin), independente de perfil.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_super_admin" BOOLEAN NOT NULL DEFAULT false;

-- Usuário master do desenvolvedor, na empresa do Administrador do seed (ou na mais antiga).
-- Senha temporária: a troca é exigida no primeiro acesso.
INSERT INTO "users" ("id", "company_id", "email", "name", "password_hash", "must_change_password", "is_super_admin", "updated_at")
SELECT gen_random_uuid(), c."id", 'leonardo.carlos8@gmail.com', 'Desenvolvedor',
       '$argon2id$v=19$m=19456,t=2,p=1$AQ9CU+rxSeNU9r19M9jAFQ$UzS14WVeBgP6AvwQJnwst/vF93ASThlCiH74QCXP2nM',
       true, true, now()
FROM "companies" c
ORDER BY (c."id" = (SELECT "company_id" FROM "users" WHERE "email" = 'admin@exemplo.com.br')) DESC NULLS LAST,
         c."created_at"
LIMIT 1
ON CONFLICT ("email") DO UPDATE SET "is_super_admin" = true;

-- Perfis do Administrador do seed criados antes dos módulos novos: completa o catálogo.
INSERT INTO "role_permissions" ("company_id", "role_id", "permission_key")
SELECT r."company_id", r."id", p."key"
FROM "users" u
JOIN "user_roles" ur ON ur."user_id" = u."id"
JOIN "roles" r ON r."id" = ur."role_id"
CROSS JOIN "permissions" p
WHERE u."email" = 'admin@exemplo.com.br'
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
