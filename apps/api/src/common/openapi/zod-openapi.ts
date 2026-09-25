import { Body, Param, Query } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, ApiResponse, type OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../validation/zod-validation.pipe';

type SchemaIo = 'input' | 'output';

// O pacote não exporta `SchemaObject`; derivamos da definição pública do documento.
type SchemaOrReference = NonNullable<NonNullable<OpenAPIObject['components']>['schemas']>[string];
export type SchemaObject = Exclude<SchemaOrReference, { $ref: string }>;

/** Converte um schema Zod em JSON Schema compatível com OpenAPI 3.0. */
export function toOpenApiSchema(schema: z.ZodType, io: SchemaIo): SchemaObject {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io,
    unrepresentable: 'any',
  });
  return jsonSchema as SchemaObject;
}

// Um decorator de parâmetro também registra a documentação no método. Assim um único
// `@ZodBody(schema)` valida a entrada e descreve o corpo no OpenAPI.
function applyToMethod(
  target: object,
  propertyKey: string | symbol | undefined,
  decorator: MethodDecorator,
): void {
  if (propertyKey === undefined) return;
  const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
  if (descriptor) decorator(target, propertyKey, descriptor);
}

/** Valida o corpo com o schema e o documenta no OpenAPI. */
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  return (target, propertyKey, index) => {
    Body(new ZodValidationPipe(schema))(target, propertyKey, index);
    applyToMethod(target, propertyKey, ApiBody({ schema: toOpenApiSchema(schema, 'input') }));
  };
}

/** Valida a query string (schema de objeto) e documenta cada parâmetro. */
export function ZodQuery(schema: z.ZodObject): ParameterDecorator {
  return (target, propertyKey, index) => {
    Query(new ZodValidationPipe(schema))(target, propertyKey, index);
    const jsonSchema = toOpenApiSchema(schema, 'input');
    const required = new Set(jsonSchema.required ?? []);
    for (const [name, property] of Object.entries(jsonSchema.properties ?? {})) {
      applyToMethod(
        target,
        propertyKey,
        ApiQuery({ name, required: required.has(name), schema: property as SchemaObject }),
      );
    }
  };
}

/** Valida um parâmetro de rota e o documenta. */
export function ZodParam(name: string, schema: z.ZodType): ParameterDecorator {
  return (target, propertyKey, index) => {
    Param(name, new ZodValidationPipe(schema))(target, propertyKey, index);
    applyToMethod(
      target,
      propertyKey,
      ApiParam({ name, schema: toOpenApiSchema(schema, 'input') }),
    );
  };
}

/** Documenta uma resposta a partir do schema Zod de saída. */
export function ZodResponse(
  status: number,
  schema: z.ZodType,
  description?: string,
): MethodDecorator {
  return ApiResponse({ status, description, schema: toOpenApiSchema(schema, 'output') });
}
