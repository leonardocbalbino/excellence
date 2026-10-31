import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountService } from './application/account.service';
import { PasswordResetService } from './application/password-reset.service';
import { AuthService } from './application/auth.service';
import { MfaService } from './application/mfa.service';
import { PasswordService } from './application/password.service';
import { LoginThrottler } from './infrastructure/login-throttler';
import { PasswordHasher } from './infrastructure/password-hasher';
import { RefreshTokenService } from './infrastructure/refresh-token.service';
import { TokenService } from './infrastructure/token.service';
import { AuthController } from './http/auth.controller';
import { AuthGuard } from './http/auth.guard';

/** Autenticação: login, tokens, refresh rotativo e MFA (ADR 0006). */
@Module({
  // A política de MFA vem dos perfis (MFA_POLICY exportado pelo AccessControlModule).
  imports: [AccessControlModule, NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    MfaService,
    PasswordService,
    PasswordResetService,
    AccountService,
    TokenService,
    RefreshTokenService,
    PasswordHasher,
    LoginThrottler,
    AuthGuard,
  ],
  exports: [TokenService, PasswordHasher, PasswordService, AuthGuard],
})
export class AuthModule {}
