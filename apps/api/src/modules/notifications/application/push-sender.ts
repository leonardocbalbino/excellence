import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  chunk,
  deadTokens,
  EXPO_BATCH_SIZE,
  EXPO_PUSH_URL,
  type ExpoTicket,
  type PushMessage,
  toExpoMessages,
} from '../domain/expo-push';

/**
 * Envia push aos aparelhos dos usuários pelo serviço do Expo (ADR 0022). É "melhor esforço":
 * nunca lança erro para quem chamou (a decisão do RH ou a publicação já foram gravadas) e só
 * registra no log o que falhar. Tokens que o Expo diz não existirem mais são apagados.
 *
 * Usa o client sem filtro de empresa porque roda também nos lembretes, fora de requisição; a
 * empresa vai explícita em toda consulta.
 */
@Injectable()
export class PushSender {
  private readonly logger = new Logger(PushSender.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  get enabled(): boolean {
    return this.config.get('PUSH_ENABLED') && this.config.get('NODE_ENV') !== 'test';
  }

  /** Dispara sem esperar (para não atrasar a resposta da requisição). */
  notify(companyId: string, userIds: readonly string[], message: PushMessage): void {
    void this.send(companyId, userIds, message);
  }

  /** Envia e espera. Devolve quantas mensagens o Expo aceitou. */
  async send(companyId: string, userIds: readonly string[], message: PushMessage): Promise<number> {
    if (!this.enabled || userIds.length === 0) return 0;
    try {
      const devices = await this.prisma.pushDevice.findMany({
        where: { companyId, userId: { in: [...new Set(userIds)] } },
        select: { token: true },
      });
      let accepted = 0;
      for (const batch of chunk(
        toExpoMessages(
          devices.map((d) => d.token),
          message,
        ),
        EXPO_BATCH_SIZE,
      )) {
        const tickets = await this.post(batch);
        accepted += tickets.filter((t) => t.status === 'ok').length;
        const dead = deadTokens(batch, tickets);
        if (dead.length > 0) {
          await this.prisma.pushDevice.deleteMany({ where: { token: { in: dead } } });
        }
      }
      return accepted;
    } catch (error) {
      this.logger.warn({ err: error, kind: message.data.kind }, 'Falha ao enviar push');
      return 0;
    }
  }

  private async post(messages: unknown[]): Promise<ExpoTicket[]> {
    const token = this.config.get('EXPO_ACCESS_TOKEN');
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Expo push respondeu ${String(response.status)}`);
    const body = (await response.json()) as { data?: ExpoTicket[] };
    return body.data ?? [];
  }
}
