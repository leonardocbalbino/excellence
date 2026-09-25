import { Module } from '@nestjs/common';
import { CatalogsService } from './application/catalogs.service';
import { CompanyService } from './application/company.service';
import { UnitsService } from './application/units.service';
import {
  CompanyController,
  DepartmentsController,
  PositionsController,
  UnionsController,
  UnitsController,
} from './http/organization.controllers';

/** Organização: empresa, unidades (geofence), departamentos, cargos e sindicatos (ADR 0010). */
@Module({
  controllers: [
    CompanyController,
    UnitsController,
    DepartmentsController,
    PositionsController,
    UnionsController,
  ],
  providers: [CompanyService, UnitsService, CatalogsService],
  exports: [CompanyService],
})
export class OrganizationModule {}
