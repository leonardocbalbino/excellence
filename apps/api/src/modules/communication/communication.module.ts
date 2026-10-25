import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { ConversationsService } from './application/conversations.service';
import {
  ConversationsController,
  MyConversationsController,
} from './http/conversations.controllers';

/** Comunicação: atendimento do funcionário com o RH, por chamados numerados (ADR 0023). */
@Module({
  imports: [FilesModule, NotificationsModule, WorkforceModule],
  controllers: [MyConversationsController, ConversationsController],
  providers: [ConversationsService],
})
export class CommunicationModule {}
