import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toOpenApiSchema } from './zod-openapi';

describe('toOpenApiSchema', () => {
  const schema = z.object({
    name: z.string(),
    active: z.boolean().default(true),
    nickname: z.string().nullable(),
  });

  it('remove $schema e marca campos com default como opcionais na entrada', () => {
    const input = toOpenApiSchema(schema, 'input');
    expect(input).not.toHaveProperty('$schema');
    expect(input.required).toEqual(['name', 'nickname']);
  });

  it('marca campos com default como obrigatórios na saída', () => {
    expect(toOpenApiSchema(schema, 'output').required).toEqual(['name', 'active', 'nickname']);
  });

  it('representa nullable no dialeto OpenAPI 3.0', () => {
    expect(toOpenApiSchema(schema, 'input').properties?.nickname).toMatchObject({ nullable: true });
  });
});
