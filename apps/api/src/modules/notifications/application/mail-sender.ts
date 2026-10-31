import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../../../config/app-config';

export interface MailMessage {
  to: readonly string[];
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export type MailResult = { sent: true } | { sent: false; error: string };

/**
 * Envio de e-mail por SMTP (ADR 0024). Configurado por SMTP_HOST e afins; sem servidor, não
 * envia e devolve o motivo, que o chamador registra (ex.: na ocorrência). Nunca lança erro.
 */
@Injectable()
export class MailSender {
  private readonly logger = new Logger(MailSender.name);
  private transport: Transporter | null = null;

  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.get('SMTP_HOST')) && this.config.get('NODE_ENV') !== 'test';
  }

  async send(message: MailMessage): Promise<MailResult> {
    if (message.to.length === 0) return { sent: false, error: 'Sem destinatários cadastrados.' };
    if (!this.configured) {
      return { sent: false, error: 'Servidor de e-mail não configurado (SMTP_HOST).' };
    }
    try {
      await this.client().sendMail({
        from: this.config.get('MAIL_FROM'),
        to: [...message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachments,
      });
      return { sent: true };
    } catch (error) {
      this.logger.warn({ err: error }, 'Falha ao enviar e-mail');
      return {
        sent: false,
        error: error instanceof Error ? error.message.slice(0, 300) : 'Falha ao enviar e-mail.',
      };
    }
  }

  private client(): Transporter {
    if (!this.transport) {
      const user = this.config.get('SMTP_USER');
      const pass = this.config.get('SMTP_PASSWORD');
      this.transport = createTransport({
        host: this.config.get('SMTP_HOST'),
        port: this.config.get('SMTP_PORT'),
        secure: this.config.get('SMTP_SECURE'),
        ...(user && pass ? { auth: { user, pass } } : {}),
      });
    }
    return this.transport;
  }
}
