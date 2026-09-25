import { randomUUID } from 'node:crypto';
import { GetObjectCommand, HeadObjectCommand, NotFound, type S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type DownloadLink,
  type FilePurpose,
  ProblemType,
  type StoredFileInfo,
  type UploadTicket,
  type uploadRequestSchema,
} from '@excellence/shared';
import type { z } from 'zod';
import { RequestContext } from '../../../common/context/request-context';
import { ProblemException } from '../../../common/errors/problem.exception';
import { AppConfig } from '../../../config/app-config';
import { TenantPrismaService } from '../../../infrastructure/prisma/tenant-prisma.service';
import { S3_CLIENT, S3_PRESIGN_CLIENT } from '../../../infrastructure/storage/storage.module';
import { matchesDeclaredType, SNIFF_BYTES } from '../domain/content-sniffing';

type UploadRequest = z.output<typeof uploadRequestSchema>;

interface FileRow {
  id: string;
  purpose: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  status: 'pending' | 'uploaded';
  createdAt: Date;
  storageKey: string;
  uploadedBy: string;
}

function toInfo(row: FileRow): StoredFileInfo {
  return {
    id: row.id,
    purpose: row.purpose as FilePurpose,
    originalName: row.originalName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Versão ASCII do nome para o parâmetro `filename` do Content-Disposition (headers não
 * aceitam não-ASCII): tira acentos e troca aspas, barras e demais caracteres por "_". O
 * nome original em UTF-8 vai no `filename*`.
 */
export function asciiFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["\\]|[^\x20-\x7e]/g, '_');
}

/**
 * Arquivos no storage S3 (ADR 0008). O navegador envia e baixa direto do storage com URLs
 * pré-assinadas de curta duração; a API só emite as URLs e registra os metadados.
 *
 * Quem pode baixar um arquivo é decidido pelo módulo dono do registro (ex.: atestado), que
 * chama `createDownloadLink` depois de checar as próprias permissões.
 */
@Injectable()
export class FilesService {
  private readonly bucket: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly db: TenantPrismaService,
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_PRESIGN_CLIENT) private readonly presign: S3Client,
    config: AppConfig,
  ) {
    this.bucket = config.get('S3_BUCKET');
    this.ttlSeconds = config.get('FILE_URL_TTL_SECONDS');
  }

  /**
   * Registra o arquivo como pendente e devolve a política de upload. O tamanho declarado e o
   * tipo viram condições da política: o storage recusa qualquer outro arquivo.
   */
  async createUpload(input: UploadRequest): Promise<UploadTicket> {
    const { companyId, userId } = RequestContext.require();
    const id = randomUUID();
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    // A chave nunca usa o nome enviado pelo usuário.
    const storageKey = `${companyId}/${input.purpose}/${now.getUTCFullYear()}/${month}/${id}`;

    await this.db.client.storedFile.create({
      data: {
        id,
        companyId,
        purpose: input.purpose,
        storageKey,
        originalName: input.fileName,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploadedBy: userId,
      },
    });

    const { url, fields } = await createPresignedPost(this.presign, {
      Bucket: this.bucket,
      Key: storageKey,
      Conditions: [
        ['content-length-range', input.sizeBytes, input.sizeBytes],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: { 'Content-Type': input.contentType },
      Expires: this.ttlSeconds,
    });
    return {
      fileId: id,
      url,
      fields,
      expiresAt: new Date(now.getTime() + this.ttlSeconds * 1000).toISOString(),
    };
  }

  /** Confirma que o upload chegou ao storage com o tamanho e o tipo declarados. */
  async confirmUpload(fileId: string): Promise<StoredFileInfo> {
    const file = await this.ownFile(fileId);
    if (file.status === 'uploaded') return toInfo(file);

    let head;
    try {
      head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: file.storageKey }),
      );
    } catch (error) {
      if (error instanceof NotFound) {
        throw new ProblemException({
          type: ProblemType.FileNotUploaded,
          title: 'Conflict',
          status: HttpStatus.CONFLICT,
          detail: 'O arquivo ainda não foi enviado ao armazenamento.',
        });
      }
      throw error;
    }
    if (
      head.ContentLength !== file.sizeBytes ||
      head.ContentType !== file.contentType ||
      !matchesDeclaredType(file.contentType, await this.readHead(file.storageKey))
    ) {
      throw new ProblemException({
        type: ProblemType.FileMismatch,
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'O arquivo enviado não corresponde ao declarado.',
      });
    }

    const updated = await this.db.client.storedFile.update({
      where: { id: file.id },
      data: { status: 'uploaded', confirmedAt: new Date() },
    });
    return toInfo(updated);
  }

  /** Informações do arquivo enviado pelo próprio usuário. */
  async getOwn(fileId: string): Promise<StoredFileInfo> {
    return toInfo(await this.ownFile(fileId));
  }

  /** Link de download do arquivo enviado pelo próprio usuário (ex.: pré-visualização). */
  async createOwnDownloadLink(fileId: string): Promise<DownloadLink> {
    return this.createDownloadLink(fileId);
  }

  /**
   * Link temporário de download. **Não checa permissão**: o chamador (módulo dono do
   * registro) é responsável por isso.
   */
  async createDownloadLink(fileId: string): Promise<DownloadLink> {
    const file = await this.db.client.storedFile.findUnique({ where: { id: fileId } });
    if (file?.status !== 'uploaded') throw new NotFoundException('Arquivo não encontrado.');
    const url = await getSignedUrl(
      this.presign,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: file.storageKey,
        ResponseContentType: file.contentType,
        ResponseContentDisposition: `attachment; filename="${asciiFileName(file.originalName)}"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
      }),
      { expiresIn: this.ttlSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString() };
  }

  private async readHead(storageKey: string): Promise<Uint8Array> {
    const object = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Range: `bytes=0-${SNIFF_BYTES - 1}`,
      }),
    );
    return (await object.Body?.transformToByteArray()) ?? new Uint8Array();
  }

  private async ownFile(fileId: string): Promise<FileRow> {
    const { userId } = RequestContext.require();
    const file = await this.db.client.storedFile.findUnique({ where: { id: fileId } });
    // Arquivo de outra pessoa responde como inexistente, sem revelar que existe.
    if (file?.uploadedBy !== userId) throw new NotFoundException('Arquivo não encontrado.');
    return file;
  }
}
