import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { changePasswordInputSchema } from '@excellence/shared';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  type AuthenticatedResponse,
  authenticatedResponseSchema,
  authUserSchema,
  type AuthUser,
  loginRequestSchema,
  type LoginResponse,
  loginResponseSchema,
  mfaActivateResponseSchema,
  type MfaActivateResponse,
  mfaCodeRequestSchema,
  type MfaSetupResponse,
  mfaSetupResponseSchema,
  refreshRequestSchema,
} from '@excellence/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { ZodBody, ZodResponse } from '../../../common/openapi/zod-openapi';
import { AnyAuthenticated } from '../../access-control/http/access.decorators';
import { AppConfig } from '../../../config/app-config';
import { AuthService, type SessionResult } from '../application/auth.service';
import { MfaService } from '../application/mfa.service';
import { PasswordService } from '../application/password.service';
import type { AuthPrincipal } from '../domain/auth-principal';
import type { ClientMetadata } from '../infrastructure/refresh-token.service';
import { AcceptTokenTypes, CurrentPrincipal, Public } from './auth.decorators';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from './refresh-cookie';

function metadataOf(req: Request): ClientMetadata {
  return {
    ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    userAgent: req.headers['user-agent'],
    requestId: typeof req.id === 'string' ? req.id : undefined,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookie: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly passwords: PasswordService,
    config: AppConfig,
  ) {
    this.secureCookie = config.get('AUTH_COOKIE_SECURE');
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login com e-mail e senha; pode exigir MFA na sequência' })
  @ZodResponse(HttpStatus.OK, loginResponseSchema)
  async login(
    @ZodBody(loginRequestSchema) body: z.output<typeof loginRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body, metadataOf(req));
    res.setHeader('Cache-Control', 'no-store');
    return result.kind === 'mfa' ? result.body : this.deliver(res, result.session);
  }

  @Post('mfa/verify')
  @AcceptTokenTypes('mfa_challenge')
  @AnyAuthenticated()
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Conclui o login com código TOTP ou de recuperação (token mfa_challenge)',
  })
  @ZodResponse(HttpStatus.OK, authenticatedResponseSchema)
  async verifyMfa(
    @CurrentPrincipal() principal: AuthPrincipal,
    @ZodBody(mfaCodeRequestSchema) body: z.output<typeof mfaCodeRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedResponse> {
    const session = await this.auth.verifyMfa(principal, body.code, metadataOf(req));
    res.setHeader('Cache-Control', 'no-store');
    return this.deliver(res, session);
  }

  @Post('mfa/setup')
  @AcceptTokenTypes('access', 'mfa_enrollment')
  @AnyAuthenticated({ allowPendingSetup: true })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Gera o segredo TOTP para cadastrar no aplicativo autenticador' })
  @ZodResponse(HttpStatus.OK, mfaSetupResponseSchema)
  async setupMfa(
    @CurrentPrincipal() principal: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaSetupResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return this.mfa.setup(principal.userId);
  }

  @Post('mfa/activate')
  @AcceptTokenTypes('access', 'mfa_enrollment')
  @AnyAuthenticated({ allowPendingSetup: true })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ativa o MFA com um código válido e devolve os códigos de recuperação' })
  @ZodResponse(HttpStatus.OK, mfaActivateResponseSchema)
  async activateMfa(
    @CurrentPrincipal() principal: AuthPrincipal,
    @ZodBody(mfaCodeRequestSchema) body: z.output<typeof mfaCodeRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MfaActivateResponse> {
    const result = await this.auth.activateMfa(principal, body.code, metadataOf(req));
    res.setHeader('Cache-Control', 'no-store');
    return {
      recoveryCodes: result.recoveryCodes,
      ...(result.session ? { session: this.deliver(res, result.session) } : {}),
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Troca o refresh token (cookie ou corpo) por uma nova sessão' })
  @ZodResponse(HttpStatus.OK, authenticatedResponseSchema)
  async refresh(
    @ZodBody(refreshRequestSchema) body: z.output<typeof refreshRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthenticatedResponse> {
    const token = body.refreshToken ?? readRefreshCookie(req) ?? '';
    const session = await this.auth.refresh(token, body.client, metadataOf(req));
    res.setHeader('Cache-Control', 'no-store');
    return this.deliver(res, session);
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Encerra a sessão (revoga a família do refresh token)' })
  async logout(
    @ZodBody(refreshRequestSchema) body: z.output<typeof refreshRequestSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(body.refreshToken ?? readRefreshCookie(req), metadataOf(req));
    clearRefreshCookie(res, this.secureCookie);
  }

  @Post('password')
  @AnyAuthenticated({ allowPendingSetup: true })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Troca a própria senha (encerra as outras sessões)' })
  async changePassword(
    @CurrentPrincipal() principal: AuthPrincipal,
    @ZodBody(changePasswordInputSchema) body: z.output<typeof changePasswordInputSchema>,
  ): Promise<void> {
    await this.passwords.change(principal, body.currentPassword, body.newPassword);
  }

  @Get('me')
  @AnyAuthenticated({ allowPendingSetup: true })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuário da sessão atual' })
  @ZodResponse(HttpStatus.OK, authUserSchema)
  me(@CurrentPrincipal() principal: AuthPrincipal): Promise<AuthUser> {
    return this.auth.me(principal);
  }

  /** Web recebe o refresh token em cookie httpOnly; mobile, no corpo. */
  private deliver(res: Response, session: SessionResult): AuthenticatedResponse {
    if (session.client === 'mobile')
      return { ...session.body, refreshToken: session.refresh.token };
    setRefreshCookie(res, session.refresh.token, session.refresh.expiresAt, this.secureCookie);
    return session.body;
  }
}
