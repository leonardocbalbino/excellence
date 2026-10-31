import { Controller, Delete, Get, HttpCode, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { avatarInputSchema, type MyAvatar, myAvatarSchema } from '@excellence/shared';
import type { z } from 'zod';
import { ZodBody, ZodResponse } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
} from '../../access-control/http/access.decorators';
import { AvatarService } from '../application/avatar.service';

@ApiTags('files')
@ApiBearerAuth()
@Controller('me/avatar')
export class AvatarController {
  constructor(private readonly avatar: AvatarService) {}

  @Get()
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Link temporário da foto de perfil (null = sem foto)' })
  @ZodResponse(HttpStatus.OK, myAvatarSchema)
  get(@Access() grant: AccessGrant): Promise<MyAvatar> {
    return this.avatar.get(grant);
  }

  @Put()
  @AnyAuthenticated()
  @ApiOperation({ summary: 'Troca a foto de perfil por um arquivo enviado (finalidade avatar)' })
  @ZodResponse(HttpStatus.OK, myAvatarSchema)
  set(
    @ZodBody(avatarInputSchema) body: z.output<typeof avatarInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<MyAvatar> {
    return this.avatar.set(body.fileId, grant);
  }

  @Delete()
  @AnyAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Access() grant: AccessGrant): Promise<void> {
    return this.avatar.remove(grant);
  }
}
