-- Desligamentos registrados antes da limpeza automática: a escala termina no dia do
-- desligamento (vínculos que começariam depois saem) e o funcionário deixa as rotas de ronda.

DELETE FROM "employee_schedule_assignments" a
USING "employees" e
WHERE a."employee_id" = e."id"
  AND e."termination_date" IS NOT NULL
  AND a."start_date" > e."termination_date";

UPDATE "employee_schedule_assignments" a
SET "end_date" = e."termination_date", "updated_at" = now()
FROM "employees" e
WHERE a."employee_id" = e."id"
  AND e."termination_date" IS NOT NULL
  AND (a."end_date" IS NULL OR a."end_date" > e."termination_date");

DELETE FROM "patrol_route_assignees" r
USING "employees" e
WHERE r."employee_id" = e."id"
  AND e."termination_date" IS NOT NULL
  AND e."termination_date" < CURRENT_DATE;
