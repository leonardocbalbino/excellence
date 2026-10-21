-- Perfis de Administrador criados antes de módulos novos (rondas, benefícios…) ficaram sem as
-- permissões desses módulos. Como só concede quem tem, o Administrador não conseguia nem
-- completar o próprio perfil ("Você não pode conceder permissões que não possui").
--
-- Correção única, em todas as empresas: perfil padrão (is_system) que administra perfis
-- (roles:manage) recebe o catálogo inteiro. Daqui em diante, permissão nova vai sozinha para
-- os perfis com acesso total (syncPermissionCatalog, na subida da API).
INSERT INTO "role_permissions" ("company_id", "role_id", "permission_key")
SELECT r."company_id", r."id", p."key"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."is_system"
  AND EXISTS (
    SELECT 1 FROM "role_permissions" rp
    WHERE rp."role_id" = r."id" AND rp."permission_key" = 'roles:manage'
  )
ON CONFLICT ("role_id", "permission_key") DO NOTHING;
