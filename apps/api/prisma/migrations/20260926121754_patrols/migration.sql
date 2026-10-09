-- CreateEnum
CREATE TYPE "patrol_run_status" AS ENUM ('in_progress', 'completed', 'incomplete');

-- CreateTable
CREATE TABLE "patrol_points" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius_meters" INTEGER,
    "code_token" TEXT NOT NULL,
    "code_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patrol_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_routes" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "name" CITEXT NOT NULL,
    "description" TEXT,
    "expected_minutes" SMALLINT NOT NULL,
    "enforce_order" BOOLEAN NOT NULL DEFAULT false,
    "start_minutes" SMALLINT[],
    "weekdays" SMALLINT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patrol_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_route_points" (
    "route_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "point_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    CONSTRAINT "patrol_route_points_pkey" PRIMARY KEY ("route_id","position")
);

-- CreateTable
CREATE TABLE "patrol_route_assignees" (
    "route_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,

    CONSTRAINT "patrol_route_assignees_pkey" PRIMARY KEY ("route_id","employee_id")
);

-- CreateTable
CREATE TABLE "patrol_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "route_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "point_ids" UUID[],
    "enforce_order" BOOLEAN NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "expected_end_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "patrol_run_status" NOT NULL DEFAULT 'in_progress',
    "finished_at" TIMESTAMPTZ(6),
    "finish_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_checkins" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "point_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "device_recorded_at" TIMESTAMPTZ(6),
    "code_version" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "accuracy_meters" DOUBLE PRECISION,
    "distance_meters" DOUBLE PRECISION,
    "geofence_status" "geofence_status" NOT NULL,
    "out_of_order" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patrol_points_company_id_unit_id_name_key" ON "patrol_points"("company_id", "unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_points_id_company_id_key" ON "patrol_points"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_routes_company_id_unit_id_name_key" ON "patrol_routes"("company_id", "unit_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_routes_id_company_id_key" ON "patrol_routes"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_route_points_route_id_point_id_key" ON "patrol_route_points"("route_id", "point_id");

-- CreateIndex
CREATE INDEX "patrol_route_assignees_company_id_employee_id_idx" ON "patrol_route_assignees"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "patrol_runs_company_id_started_at_idx" ON "patrol_runs"("company_id", "started_at");

-- CreateIndex
CREATE INDEX "patrol_runs_company_id_employee_id_started_at_idx" ON "patrol_runs"("company_id", "employee_id", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_runs_id_company_id_key" ON "patrol_runs"("id", "company_id");

-- CreateIndex
CREATE INDEX "patrol_checkins_company_id_recorded_at_idx" ON "patrol_checkins"("company_id", "recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_checkins_run_id_point_id_key" ON "patrol_checkins"("run_id", "point_id");

-- AddForeignKey
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_points" ADD CONSTRAINT "patrol_route_points_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_points" ADD CONSTRAINT "patrol_route_points_route_id_company_id_fkey" FOREIGN KEY ("route_id", "company_id") REFERENCES "patrol_routes"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_points" ADD CONSTRAINT "patrol_route_points_point_id_company_id_fkey" FOREIGN KEY ("point_id", "company_id") REFERENCES "patrol_points"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_assignees" ADD CONSTRAINT "patrol_route_assignees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_assignees" ADD CONSTRAINT "patrol_route_assignees_route_id_company_id_fkey" FOREIGN KEY ("route_id", "company_id") REFERENCES "patrol_routes"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_route_assignees" ADD CONSTRAINT "patrol_route_assignees_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_route_id_company_id_fkey" FOREIGN KEY ("route_id", "company_id") REFERENCES "patrol_routes"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_employee_id_company_id_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_unit_id_company_id_fkey" FOREIGN KEY ("unit_id", "company_id") REFERENCES "units"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_checkins" ADD CONSTRAINT "patrol_checkins_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_checkins" ADD CONSTRAINT "patrol_checkins_run_id_company_id_fkey" FOREIGN KEY ("run_id", "company_id") REFERENCES "patrol_runs"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_checkins" ADD CONSTRAINT "patrol_checkins_point_id_company_id_fkey" FOREIGN KEY ("point_id", "company_id") REFERENCES "patrol_points"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Regras mantidas em SQL ────────────────────────────────────────────────────────
-- Check-ins são append-only (regra 2).
CREATE TRIGGER patrol_checkins_append_only
  BEFORE UPDATE OR DELETE ON "patrol_checkins"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TRIGGER patrol_checkins_no_truncate
  BEFORE TRUNCATE ON "patrol_checkins"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

-- A ronda só muda uma vez: ao ser encerrada (situação, horário e observação do fim).
CREATE FUNCTION patrol_runs_finish_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'patrol_runs é append-only: rondas não podem ser excluídas'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status <> 'in_progress'
     OR NEW.status = 'in_progress'
     OR (NEW.id, NEW.company_id, NEW.route_id, NEW.employee_id, NEW.unit_id, NEW.point_ids,
         NEW.enforce_order, NEW.scheduled_for, NEW.started_at, NEW.expected_end_at, NEW.created_at)
        IS DISTINCT FROM
        (OLD.id, OLD.company_id, OLD.route_id, OLD.employee_id, OLD.unit_id, OLD.point_ids,
         OLD.enforce_order, OLD.scheduled_for, OLD.started_at, OLD.expected_end_at, OLD.created_at)
  THEN
    RAISE EXCEPTION 'patrol_runs: só o encerramento de uma ronda em andamento é permitido'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patrol_runs_finish_only
  BEFORE UPDATE OR DELETE ON "patrol_runs"
  FOR EACH ROW EXECUTE FUNCTION patrol_runs_finish_only();

CREATE TRIGGER patrol_runs_no_truncate
  BEFORE TRUNCATE ON "patrol_runs"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_mutation();

ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_finish_check" CHECK (
  ("status" = 'in_progress') = ("finished_at" IS NULL)
);
ALTER TABLE "patrol_runs" ADD CONSTRAINT "patrol_runs_points_check" CHECK (
  cardinality("point_ids") > 0 AND "expected_end_at" > "started_at"
);

-- Uma ronda em andamento por funcionário; um horário previsto cumprido por uma só ronda.
CREATE UNIQUE INDEX "patrol_runs_one_open"
  ON "patrol_runs" ("employee_id") WHERE "status" = 'in_progress';
CREATE UNIQUE INDEX "patrol_runs_one_per_slot"
  ON "patrol_runs" ("route_id", "scheduled_for") WHERE "scheduled_for" IS NOT NULL;

ALTER TABLE "patrol_routes" ADD CONSTRAINT "patrol_routes_values_check" CHECK (
  "expected_minutes" BETWEEN 5 AND 720
  AND 0 <= ALL ("start_minutes") AND 1439 >= ALL ("start_minutes")
  AND "weekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
);
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_location_check" CHECK (
  ("latitude" IS NULL) = ("longitude" IS NULL)
  AND ("radius_meters" IS NULL OR "latitude" IS NOT NULL)
);
