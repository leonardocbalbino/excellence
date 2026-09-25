import { ProblemType } from '@excellence/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProblemException } from '../errors/problem.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  name: z.string().min(2),
  address: z.object({ zip: z.string().regex(/^\d{8}$/) }),
  tags: z.array(z.string()).default([]),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('retorna o valor transformado quando válido', () => {
    expect(pipe.transform({ name: 'Ana', address: { zip: '01001000' } })).toEqual({
      name: 'Ana',
      address: { zip: '01001000' },
      tags: [],
    });
  });

  it('lança ProblemException 400 com erros por caminho', () => {
    let thrown: unknown;
    try {
      pipe.transform({ name: 'A', address: { zip: 'x' }, tags: ['ok', 1] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ProblemException);
    const { problem } = thrown as ProblemException;
    expect(problem).toMatchObject({ status: 400, type: ProblemType.Validation });
    expect(problem.errors?.map((e) => e.path)).toEqual(['name', 'address.zip', 'tags.1']);
  });
});
