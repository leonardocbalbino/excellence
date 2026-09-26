import { Controller, Delete, Get, HttpCode, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type Announcement,
  announcementInputSchema,
  announcementListQuerySchema,
  type AnnouncementReceipt,
  announcementReceiptSchema,
  announcementSchema,
  type MyAnnouncement,
  type MyAnnouncementFeed,
  myAnnouncementFeedSchema,
  myAnnouncementSchema,
} from '@excellence/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { AnnouncementsService, type ReaderInfo } from '../application/announcements.service';

const idParam = z.uuid();
type AnnouncementBody = z.output<typeof announcementInputSchema>;

function readerOf(req: Request): ReaderInfo {
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('me/announcements')
export class MyAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Mural: comunicados publicados e vigentes para o usuário' })
  @ZodResponse(HttpStatus.OK, myAnnouncementFeedSchema)
  feed(@Access() grant: AccessGrant): Promise<MyAnnouncementFeed> {
    return this.announcements.feed(grant.userId);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Abre o comunicado e registra a leitura' })
  @ZodResponse(HttpStatus.OK, myAnnouncementSchema)
  open(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
    @Req() req: Request,
  ): Promise<MyAnnouncement> {
    return this.announcements.open(id, grant, readerOf(req));
  }

  @Post(':id/acknowledge')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Registra "li e estou ciente"' })
  @ZodResponse(HttpStatus.CREATED, myAnnouncementSchema)
  acknowledge(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
    @Req() req: Request,
  ): Promise<MyAnnouncement> {
    return this.announcements.acknowledge(id, grant, readerOf(req));
  }
}

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @RequirePermission('announcements:manage')
  @ZodResponse(HttpStatus.OK, z.array(announcementSchema))
  list(
    @ZodQuery(announcementListQuerySchema) query: z.output<typeof announcementListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<Announcement[]> {
    return this.announcements.list(query.status, grant);
  }

  @Post()
  @RequirePermission('announcements:manage')
  @ApiOperation({ summary: 'Cria um rascunho' })
  @ZodResponse(HttpStatus.CREATED, announcementSchema)
  create(
    @ZodBody(announcementInputSchema) body: AnnouncementBody,
    @Access() grant: AccessGrant,
  ): Promise<Announcement> {
    return this.announcements.create(body, grant);
  }

  @Get(':id')
  @RequirePermission('announcements:manage')
  @ZodResponse(HttpStatus.OK, announcementSchema)
  get(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<Announcement> {
    return this.announcements.get(id, grant);
  }

  @Put(':id')
  @RequirePermission('announcements:manage')
  @ApiOperation({ summary: 'Edita um rascunho (publicado não muda)' })
  @ZodResponse(HttpStatus.OK, announcementSchema)
  update(
    @ZodParam('id', idParam) id: string,
    @ZodBody(announcementInputSchema) body: AnnouncementBody,
    @Access() grant: AccessGrant,
  ): Promise<Announcement> {
    return this.announcements.update(id, body, grant);
  }

  @Delete(':id')
  @RequirePermission('announcements:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@ZodParam('id', idParam) id: string, @Access() grant: AccessGrant): Promise<void> {
    return this.announcements.remove(id, grant);
  }

  @Post(':id/publish')
  @RequirePermission('announcements:manage')
  @ZodResponse(HttpStatus.CREATED, announcementSchema)
  publish(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<Announcement> {
    return this.announcements.publish(id, grant);
  }

  @Post(':id/archive')
  @RequirePermission('announcements:manage')
  @ZodResponse(HttpStatus.CREATED, announcementSchema)
  archive(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<Announcement> {
    return this.announcements.archive(id, grant);
  }

  @Get(':id/receipts')
  @RequirePermission('announcements:manage')
  @ApiOperation({ summary: 'Leituras e ciências do público, no escopo de quem consulta' })
  @ZodResponse(HttpStatus.OK, z.array(announcementReceiptSchema))
  receipts(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<AnnouncementReceipt[]> {
    return this.announcements.receipts(id, grant);
  }
}
