import { Controller, Delete, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { pushDeviceInputSchema } from '@excellence/shared';
import { z } from 'zod';
import { ZodBody, ZodParam } from '../../../common/openapi/zod-openapi';
import {
  Access,
  type AccessGrant,
  AnyAuthenticated,
} from '../../access-control/http/access.decorators';
import { PushDevicesService } from '../application/push-devices.service';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('me/push-devices')
export class PushDevicesController {
  constructor(private readonly devices: PushDevicesService) {}

  @Post()
  @AnyAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registra o token de push deste aparelho para o usuário logado' })
  register(
    @ZodBody(pushDeviceInputSchema) body: z.output<typeof pushDeviceInputSchema>,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.devices.register(body, grant);
  }

  @Delete(':token')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Para de enviar push a este aparelho' })
  unregister(
    @ZodParam('token', z.string().min(1).max(200)) token: string,
    @Access() grant: AccessGrant,
  ): Promise<void> {
    return this.devices.unregister(token, grant);
  }
}
