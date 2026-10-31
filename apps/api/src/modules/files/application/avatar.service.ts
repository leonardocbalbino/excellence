import { Injectable } from '@nestjs/common';
import type { MyAvatar } from '@excellence/shared';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import type { AccessGrant } from '../../access-control/http/access.decorators';
import { AuditService } from '../../audit/application/audit.service';
import { invalidReference } from '../../organization/application/catalog-rules';
import { FilesService } from './files.service';

/**
 * Foto de perfil do usuário (ADR 0023). O app envia a imagem direto ao storage (finalidade
 * `avatar`) e depois aponta a foto para o arquivo. A foto antiga não é apagada do storage
 * (guarda segue a política de arquivos, P-006).
 */
@Injectable()
export class AvatarService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly files: FilesService,
    private readonly audit: AuditService,
  ) {}

  async get(grant: AccessGrant): Promise<MyAvatar> {
    const user = await this.db.client.user.findUnique({
      where: { id: grant.userId },
      select: { avatarFileId: true },
    });
    return user?.avatarFileId ? this.files.createDownloadLink(user.avatarFileId, 'inline') : null;
  }

  async set(fileId: string, grant: AccessGrant): Promise<MyAvatar> {
    const file = await this.files.getOwn(fileId).catch(() => null);
    if (file?.status !== 'uploaded' || file.purpose !== 'avatar') {
      throw invalidReference('fileId', 'Foto não encontrada ou ainda não enviada.');
    }
    await this.db.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: grant.userId }, data: { avatarFileId: fileId } });
      await this.audit.record(
        { action: 'user.avatar_changed', resourceType: 'user', resourceId: grant.userId },
        tx,
      );
    });
    return this.get(grant);
  }

  async remove(grant: AccessGrant): Promise<void> {
    await this.db.client.$transaction(async (tx) => {
      await tx.user.update({ where: { id: grant.userId }, data: { avatarFileId: null } });
      await this.audit.record(
        { action: 'user.avatar_removed', resourceType: 'user', resourceId: grant.userId },
        tx,
      );
    });
  }
}
