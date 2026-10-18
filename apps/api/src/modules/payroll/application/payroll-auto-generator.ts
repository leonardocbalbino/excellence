import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { RequestContext } from '../../../common/context/request-context';
import { AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { EMPTY_SCOPE } from '../../access-control/domain/data-scope';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { todayIn } from '../../workforce/domain/calendar';
import { previousMonth } from '../domain/month-summary';
import { PayrollService } from './payroll.service';

/** Usuário do contexto nas tarefas automáticas: não existe, e a auditoria grava ator nulo. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 60 * 1000;

/**
 * Virada do mês (ADR 0020): a partir do dia 1, no fuso de cada empresa, gera sozinho o
 * fechamento do mês que acabou, como rascunho, com os valores por plantão vigentes. Só gera
 * se o mês ainda não existe: o que o RH já gerou, publicou ou fechou não é tocado.
 *
 * Confere de hora em hora (a API roda numa instância só; a unicidade empresa + mês no banco
 * impede duplicar mesmo assim).
 */
@Injectable()
export class PayrollAutoGenerator implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PayrollAutoGenerator.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('PAYROLL_AUTO_GENERATE') || this.config.get('NODE_ENV') === 'test') return;
    const first = setTimeout(() => void this.run(), FIRST_CHECK_DELAY_MS);
    const every = setInterval(() => void this.run(), CHECK_INTERVAL_MS);
    first.unref();
    every.unref();
    this.timers = [first, every];
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  /** Gera o mês anterior das empresas que ainda não o têm. Devolve quantos gerou. */
  async run(now = new Date()): Promise<number> {
    let generated = 0;
    try {
      const companies = await this.prisma.company.findMany({
        select: { id: true, timezone: true, _count: { select: { employees: true } } },
      });
      for (const company of companies) {
        if (company._count.employees === 0) continue;
        const month = previousMonth(todayIn(company.timezone, now).slice(0, 7));
        const exists = await this.prisma.payrollPeriod.count({
          where: { companyId: company.id, month },
        });
        if (exists > 0) continue;
        try {
          await RequestContext.run({ companyId: company.id, userId: SYSTEM_USER_ID }, () =>
            this.payroll.generate(month, systemGrant(company.id), true),
          );
          generated += 1;
          this.logger.log({ companyId: company.id, month }, 'Fechamento do mês gerado sozinho');
        } catch (error) {
          this.logger.error(
            { err: error, companyId: company.id, month },
            'Falha ao gerar o fechamento do mês',
          );
        }
      }
    } catch (error) {
      this.logger.error({ err: error }, 'Falha na geração automática dos fechamentos');
    }
    return generated;
  }
}

function systemGrant(companyId: string): AccessGrant {
  return {
    userId: SYSTEM_USER_ID,
    companyId,
    permission: 'payroll:manage',
    scope: { ...EMPTY_SCOPE, companyWide: true },
  };
}
