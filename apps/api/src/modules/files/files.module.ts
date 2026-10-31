import { Module } from '@nestjs/common';
import { AvatarService } from './application/avatar.service';
import { FilesService } from './application/files.service';
import { AvatarController } from './http/avatar.controller';
import { FilesController } from './http/files.controller';

/** Arquivos: upload e download via URL pré-assinada (ADR 0008) e foto de perfil (ADR 0023). */
@Module({
  controllers: [FilesController, AvatarController],
  providers: [FilesService, AvatarService],
  exports: [FilesService],
})
export class FilesModule {}
