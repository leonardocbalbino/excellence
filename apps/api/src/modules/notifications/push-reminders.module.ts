import { Module } from '@nestjs/common';
import { TimeTrackingModule } from '../time-tracking/time-tracking.module';
import { PushReminders } from './application/push-reminders';
import { NotificationsModule } from './notifications.module';

/** Lembretes de ronda e de ponto a cada minuto (ADR 0022). */
@Module({
  imports: [NotificationsModule, TimeTrackingModule],
  providers: [PushReminders],
})
export class PushRemindersModule {}
