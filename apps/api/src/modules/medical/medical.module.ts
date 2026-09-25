import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { MedicalCertificatesService } from './application/medical-certificates.service';
import {
  EmployeeMedicalCertificatesController,
  MedicalCertificatesController,
  MyMedicalCertificatesController,
} from './http/medical-certificates.controllers';

/** Atestados: envio, análise pelo RH e CID como dado sensível auditado (ADR 0013). */
@Module({
  imports: [FilesModule, WorkforceModule],
  controllers: [
    MyMedicalCertificatesController,
    EmployeeMedicalCertificatesController,
    MedicalCertificatesController,
  ],
  providers: [MedicalCertificatesService],
  exports: [MedicalCertificatesService],
})
export class MedicalModule {}
