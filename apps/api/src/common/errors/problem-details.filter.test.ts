import {
  type ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { isProblemDetails, type ProblemDetails, ProblemType } from '@excellence/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PROBLEM_CONTENT_TYPE, ProblemDetailsFilter } from './problem-details.filter';
import { ProblemException } from './problem.exception';

function prismaError(code: string): Error {
  return Object.assign(new Error(`prisma ${code}`), {
    name: 'PrismaClientKnownRequestError',
    code,
  });
}

function createHost(request: Record<string, unknown> = {}) {
  const response = {
    headersSent: false,
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const req = { originalUrl: '/api/v1/things/1?x=1', id: 'req-12345678', ...request };
  const host = {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;
  let logError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
    // Silencia o log de 5xx esperado nos testes.
    logError = vi.fn();
    Object.assign(filter, { logger: { error: logError } });
  });

  function run(exception: unknown, request?: Record<string, unknown>): ProblemDetails {
    const { host, response } = createHost(request);
    filter.catch(exception, host);
    expect(response.type).toHaveBeenCalledWith(PROBLEM_CONTENT_TYPE);
    const body = response.json.mock.calls[0]?.[0] as ProblemDetails;
    expect(isProblemDetails(body)).toBe(true);
    expect(response.status).toHaveBeenCalledWith(body.status);
    return body;
  }

  it('converte HttpException sem mensagem sem repetir o título', () => {
    expect(run(new NotFoundException())).toEqual({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      instance: '/api/v1/things/1',
      requestId: 'req-12345678',
    });
  });

  it('usa a mensagem da HttpException como detail', () => {
    expect(run(new BadRequestException('Data inválida'))).toMatchObject({
      title: 'Bad Request',
      status: 400,
      detail: 'Data inválida',
    });
  });

  it('junta mensagens em array', () => {
    const body = run(new HttpException({ message: ['a', 'b'] }, HttpStatus.UNPROCESSABLE_ENTITY));
    expect(body).toMatchObject({ status: 422, title: 'Unprocessable Entity', detail: 'a; b' });
  });

  it('preserva o problema completo de ProblemException', () => {
    const body = run(
      new ProblemException({
        type: ProblemType.Validation,
        title: 'Bad Request',
        status: 400,
        errors: [{ path: 'email', message: 'inválido' }],
      }),
    );
    expect(body).toMatchObject({
      type: ProblemType.Validation,
      errors: [{ path: 'email', message: 'inválido' }],
      requestId: 'req-12345678',
    });
  });

  it.each([
    ['P2002', 409, ProblemType.UniqueViolation],
    ['P2003', 409, ProblemType.ReferenceViolation],
    ['P2025', 404, ProblemType.Default],
  ])('mapeia erro Prisma %s para %i', (code, status, type) => {
    expect(run(prismaError(code))).toMatchObject({ status, type });
  });

  it('trata erro Prisma desconhecido como 500', () => {
    expect(run(prismaError('P1001')).status).toBe(500);
  });

  it('não vaza a mensagem de erro inesperado e loga o erro', () => {
    const body = run(new Error('senha do banco: hunter2'));
    expect(body).toEqual({
      type: 'about:blank',
      title: 'Internal Server Error',
      status: 500,
      instance: '/api/v1/things/1',
      requestId: 'req-12345678',
    });
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(logError).toHaveBeenCalledOnce();
  });

  it('não loga erros 4xx', () => {
    run(new NotFoundException());
    expect(logError).not.toHaveBeenCalled();
  });

  it('omite requestId quando a requisição não tem ID', () => {
    expect(run(new NotFoundException(), { id: undefined })).not.toHaveProperty('requestId');
  });

  it('não escreve resposta se os headers já foram enviados', () => {
    const { host, response } = createHost();
    response.headersSent = true;
    filter.catch(new NotFoundException(), host);
    expect(response.json).not.toHaveBeenCalled();
  });
});
