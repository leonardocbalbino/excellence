import { Module } from '@nestjs/common';
import { OrganizationModule } from '../organization/organization.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { BenefitsService } from './application/benefits.service';
import { UsefulLinksService } from './application/useful-links.service';
import {
  BenefitsController,
  EmployeeBenefitsController,
  MyBenefitsController,
  UsefulLinksController,
} from './http/benefits.controllers';

/** Benefícios (catálogo e atribuição) e links úteis (ADR 0017). */
@Module({
  imports: [OrganizationModule, WorkforceModule],
  controllers: [
    BenefitsController,
    EmployeeBenefitsController,
    UsefulLinksController,
    MyBenefitsController,
  ],
  providers: [BenefitsService, UsefulLinksService],
  exports: [BenefitsService],
})
export class BenefitsModule {}
