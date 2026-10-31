import { Module } from '@nestjs/common';
import { MailSender } from './application/mail-sender';
import { Notifier } from './application/notifier';
import { PushDevicesService } from './application/push-devices.service';
import { PushSender } from './application/push-sender';
import { PushDevicesController } from './http/push-devices.controller';

/**
 * Notificações push do app do funcionário (ADR 0022): aparelhos, envio pelo Expo e as
 * mensagens dos acontecimentos; e-mail por SMTP (ADR 0024). Não importa módulos de domínio, para que ponto, atestados e
 * comunicados possam usá-lo sem ciclo; os lembretes ficam em `PushRemindersModule`.
 */
@Module({
  controllers: [PushDevicesController],
  providers: [PushSender, Notifier, PushDevicesService, MailSender],
  exports: [PushSender, Notifier, MailSender],
})
export class NotificationsModule {}
