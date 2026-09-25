import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { problemDetailsSchema } from '@excellence/shared';
import { toOpenApiSchema } from './zod-openapi';

/** Publica a especificação em /openapi.json e a interface em /docs. */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Excellence API')
    .setDescription('API de gestão de pessoas, controle de ponto e rondas.')
    .setVersion('v1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  document.components ??= {};
  document.components.schemas = {
    ...document.components.schemas,
    ProblemDetails: toOpenApiSchema(problemDetailsSchema, 'output'),
  };

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
    yamlDocumentUrl: 'openapi.yaml',
  });
}
