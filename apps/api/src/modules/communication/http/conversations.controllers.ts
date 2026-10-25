import { Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type ConversationDetail,
  conversationDetailSchema,
  conversationListQuerySchema,
  type ConversationMessage,
  conversationMessageInputSchema,
  conversationMessageSchema,
  conversationStartSchema,
  type ConversationSummary,
  conversationSummarySchema,
  conversationUnreadSchema,
  type DownloadLink,
  downloadLinkSchema,
} from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam, ZodQuery, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
  RequirePermission,
} from '../../access-control/http/access.decorators';
import { ConversationsService } from '../application/conversations.service';

const idParam = z.uuid();
type MessageBody = z.output<typeof conversationMessageInputSchema>;

/** Chamados do próprio funcionário com o RH (ADR 0023). */
@ApiTags('conversations')
@ApiBearerAuth()
@Controller('me/conversations')
export class MyConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, z.array(conversationSummarySchema))
  mine(@Access() grant: AccessGrant): Promise<ConversationSummary[]> {
    return this.conversations.mine(grant);
  }

  @Get('unread')
  @AnyAuthenticated()
  @ZodResponse(HttpStatus.OK, conversationUnreadSchema)
  unread(@Access() grant: AccessGrant): Promise<{ conversations: number }> {
    return this.conversations.myUnread(grant);
  }

  @Post()
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Abre um chamado com o RH (recebe um número único)' })
  @ZodResponse(HttpStatus.CREATED, conversationDetailSchema)
  start(
    @ZodBody(conversationStartSchema) body: z.output<typeof conversationStartSchema>,
    @Access() grant: AccessGrant,
  ): Promise<ConversationDetail> {
    return this.conversations.start(body, grant);
  }

  @Get(':id')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Abre o chamado e marca como lidas as mensagens do RH' })
  @ZodResponse(HttpStatus.OK, conversationDetailSchema)
  open(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<ConversationDetail> {
    return this.conversations.openMine(id, grant);
  }

  @Post(':id/messages')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Nova mensagem do funcionário (reabre o chamado encerrado)' })
  @ZodResponse(HttpStatus.CREATED, conversationMessageSchema)
  reply(
    @ZodParam('id', idParam) id: string,
    @ZodBody(conversationMessageInputSchema) body: MessageBody,
    @Access() grant: AccessGrant,
  ): Promise<ConversationMessage> {
    return this.conversations.replyMine(id, body, grant);
  }
}

/** Atendimento do RH (`conversations:manage`, no escopo da permissão). */
@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @RequirePermission('conversations:manage')
  @ZodResponse(HttpStatus.OK, z.array(conversationSummarySchema))
  list(
    @ZodQuery(conversationListQuerySchema) query: z.output<typeof conversationListQuerySchema>,
    @Access() grant: AccessGrant,
  ): Promise<ConversationSummary[]> {
    return this.conversations.list(query, grant);
  }

  @Get('unread')
  @RequirePermission('conversations:manage')
  @ZodResponse(HttpStatus.OK, conversationUnreadSchema)
  unread(@Access() grant: AccessGrant): Promise<{ conversations: number }> {
    return this.conversations.unread(grant);
  }

  @Get(':id')
  @RequirePermission('conversations:manage')
  @ZodResponse(HttpStatus.OK, conversationDetailSchema)
  get(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<ConversationDetail> {
    return this.conversations.get(id, grant);
  }

  @Post(':id/messages')
  @RequirePermission('conversations:manage')
  @ApiOperation({ summary: 'Resposta do RH (avisa o funcionário por push)' })
  @ZodResponse(HttpStatus.CREATED, conversationMessageSchema)
  reply(
    @ZodParam('id', idParam) id: string,
    @ZodBody(conversationMessageInputSchema) body: MessageBody,
    @Access() grant: AccessGrant,
  ): Promise<ConversationMessage> {
    return this.conversations.reply(id, body, grant);
  }

  @Post(':id/close')
  @RequirePermission('conversations:manage')
  @ZodResponse(HttpStatus.CREATED, conversationSummarySchema)
  close(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<ConversationSummary> {
    return this.conversations.close(id, grant);
  }

  @Post(':id/reopen')
  @RequirePermission('conversations:manage')
  @ZodResponse(HttpStatus.CREATED, conversationSummarySchema)
  reopen(
    @ZodParam('id', idParam) id: string,
    @Access() grant: AccessGrant,
  ): Promise<ConversationSummary> {
    return this.conversations.reopen(id, grant);
  }

  /** Funcionário do chamado ou RH no escopo; o serviço confere. */
  @Get(':id/attachments/:fileId')
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Link temporário de um anexo do chamado' })
  @ZodResponse(HttpStatus.OK, downloadLinkSchema)
  attachment(
    @ZodParam('id', idParam) id: string,
    @ZodParam('fileId', idParam) fileId: string,
    @Access() grant: AccessGrant,
  ): Promise<DownloadLink> {
    return this.conversations.attachment(id, fileId, grant);
  }
}
