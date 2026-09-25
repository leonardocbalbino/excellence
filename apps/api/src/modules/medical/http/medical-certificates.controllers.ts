import { Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type DownloadLink,
  downloadLinkSchema,
  type MedicalCertificate,
  medicalCertificateInputSchema,
  medicalCertificateListQuerySchema,
  medicalCertificateReviewSchema,
  medicalCertificateSchema,
  type MedicalCertificateSensitive,
  medicalCertificateSensitiveSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { MedicalCertificatesService } from '../application/medical-certificates.service';

const idParam = z.uuid();
type CertificateBody = z.output<typeof medicalCertificateInputSchema>;
type ReviewBody = z.output<typeof medicalCertificateReviewSchema>;

@ApiTags('medical-certificates')
@ApiBearerAuth()
@Controller('me/medical-certificates')
export class MyMedicalCertificatesController {
  constructor(private readonly certificates: MedicalCertificatesService) {}

  @Post()
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Envia um atestado do próprio funcionário' })
  @ZodResponse(HttpStatus.CREATED, medicalCertificateSchema)
  submit(
    @ZodBody(medicalCertificateInputSchema) body: CertificateBody,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    return this.certificates.submitMine(body, grant);
  }

  @Get()
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, z.array(medicalCertificateSchema))
  mine(@Access() grant: AccessGrant): Promise<MedicalCertificate[]> {
    return this.certificates.listMine(grant.userId);
  }

  @Get(':id/document')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Link temporário do documento do próprio atestado' })
  @ZodResponse(HttpStatus.OK, downloadLinkSchema)
  document(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<DownloadLink> {
    return this.certificates.myDocument(id, grant.userId);
  }

  @Post(':id/cancel')
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.CREATED, medicalCertificateSchema)
  cancel(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    return this.certificates.cancelMine(id, grant.userId);
  }
}

@ApiTags('medical-certificates')
@ApiBearerAuth()
@Controller('employees/:employeeId/medical-certificates')
export class EmployeeMedicalCertificatesController {
  constructor(private readonly certificates: MedicalCertificatesService) {}

  @Post()
  @RequirePermission('medical_certificates:manage')
  @ApiOperation({ summary: 'Registra um atestado em nome do funcionário' })
  @ZodResponse(HttpStatus.CREATED, medicalCertificateSchema)
  register(
    @ZodParam('employeeId', idParam) employeeId: string,
    @ZodBody(medicalCertificateInputSchema) body: CertificateBody,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    return this.certificates.registerFor(employeeId, body, grant);
  }
}

@ApiTags('medical-certificates')
@ApiBearerAuth()
@Controller('medical-certificates')
export class MedicalCertificatesController {
  constructor(private readonly certificates: MedicalCertificatesService) {}

  @Get()
  @RequirePermission('medical_certificates:read')
  @ApiOperation({ summary: 'Atestados dos funcionários no escopo (sem CID)' })
  @ZodResponse(HttpStatus.OK, z.array(medicalCertificateSchema))
  list(
    @ZodQuery(medicalCertificateListQuerySchema)
    query: z.output<typeof medicalCertificateListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate[]> {
    return this.certificates.list(query, grant);
  }

  @Get(':id/sensitive')
  @RequirePermission('medical_certificates:read_sensitive')
  @ApiOperation({ summary: 'CID e documento do atestado (leitura auditada)' })
  @ZodResponse(HttpStatus.OK, medicalCertificateSensitiveSchema)
  sensitive(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificateSensitive> {
    return this.certificates.sensitive(id, grant);
  }

  @Post(':id/accept')
  @RequirePermission('medical_certificates:review')
  @ZodResponse(HttpStatus.CREATED, medicalCertificateSchema)
  accept(
    @ZodParam('id', idParam) id: string,
    @ZodBody(medicalCertificateReviewSchema) body: ReviewBody,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    return this.certificates.accept(id, body.note ?? null, grant);
  }

  @Post(':id/reject')
  @RequirePermission('medical_certificates:review')
  @ZodResponse(HttpStatus.CREATED, medicalCertificateSchema)
  reject(
    @ZodParam('id', idParam) id: string,
    @ZodBody(medicalCertificateReviewSchema) body: ReviewBody,
    @Access() grant: AccessGrant,
  ): Promise<MedicalCertificate> {
    return this.certificates.reject(id, body.note ?? null, grant);
  }
}
