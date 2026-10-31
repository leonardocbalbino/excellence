import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { AnnouncementsService } from './application/announcements.service';
import {
  AnnouncementsController,
  MyAnnouncementsController,
} from './http/announcements.controllers';

/** Comunicados com público por unidade/departamento, leitura e ciência (ADR 0014). */
@Module({
  imports: [NotificationsModule, WorkforceModule],
  controllers: [MyAnnouncementsController, AnnouncementsController],
  providers: [AnnouncementsService],
})
export class AnnouncementsModule {}
