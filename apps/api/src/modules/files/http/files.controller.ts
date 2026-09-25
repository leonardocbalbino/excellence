import { Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type DownloadLink,
  downloadLinkSchema,
  type StoredFileInfo,
  storedFileSchema,
  type UploadTicket,
  uploadRequestSchema,
  uploadTicketSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodResponse } from '../../../common/openapi/zod-openapi';
import { AnyAuthenticated } from '../../access-control/http/access.decorators';
import { FilesService } from '../application/files.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('uploads')
  @AnyAuthenticated()
  @ApiOperation({
    summary: 'Inicia um upload: devolve a política para enviar o arquivo direto ao storage',
  })
  @ZodResponse(HttpStatus.CREATED, uploadTicketSchema)
  createUpload(
    @ZodBody(uploadRequestSchema) body: z.output<typeof uploadRequestSchema>,
  ): Promise<UploadTicket> {
    return this.files.createUpload(body);
  }

  @Post(':id/confirm')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Confirma que o arquivo chegou ao storage conforme declarado' })
  @ZodResponse(HttpStatus.CREATED, storedFileSchema)
  confirm(@ZodParam('id', z.uuid()) id: string): Promise<StoredFileInfo> {
    return this.files.confirmUpload(id);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Dados de um arquivo enviado pelo próprio usuário' })
  @ZodResponse(HttpStatus.OK, storedFileSchema)
  get(@ZodParam('id', z.uuid()) id: string): Promise<StoredFileInfo> {
    return this.files.getOwn(id);
  }

  @Get(':id/download-link')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Link temporário para baixar um arquivo enviado pelo próprio usuário' })
  @ZodResponse(HttpStatus.OK, downloadLinkSchema)
  downloadLink(@ZodParam('id', z.uuid()) id: string): Promise<DownloadLink> {
    return this.files.createOwnDownloadLink(id);
  }
}
