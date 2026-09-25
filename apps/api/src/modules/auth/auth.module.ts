import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthService } from './application/auth.service';
import { MfaService } from './application/mfa.service';
import { MFA_POLICY } from './domain/mfa-policy';
import { LoginThrottler } from './infrastructure/login-throttler';
import { NoMfaRequiredPolicy } from './infrastructure/no-mfa-required.policy';
import { PasswordHasher } from './infrastructure/password-hasher';
import { RefreshTokenService } from './infrastructure/refresh-token.service';
import { TokenService } from './infrastructure/token.service';
import { AuthController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';

/** Autenticação: login, tokens, refresh rotativo e MFA (ADR 0006). */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    TokenService,
    RefreshTokenService,
    PasswordHasher,
    LoginThrottler,
    { provide: MFA_POLICY, useClass: NoMfaRequiredPolicy },
    // Toda rota exige autenticação, salvo @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [TokenService, PasswordHasher],
})
export class AuthModule {}
