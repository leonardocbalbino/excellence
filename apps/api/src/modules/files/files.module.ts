import { Module } from '@nestjs/common';
import { FilesService } from './application/files.service';
import { FilesController } from './http/files.controller';

/** Arquivos: upload e download via URL pré-assinada (ADR 0008). */
@Module({
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
