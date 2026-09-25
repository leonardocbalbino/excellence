import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { AppConfig } from '../../src/config/app-config';

describe('AppModule', () => {
  it('monta o contêiner de DI sem conectar na infraestrutura', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef.get(AppConfig).get('NODE_ENV')).toBe('test');
    await moduleRef.close();
  });
});
