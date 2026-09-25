import { hash, verify } from '@node-rs/argon2';
import { Injectable, type OnModuleInit } from '@nestjs/common';

// argon2id (padrão da biblioteca) com os parâmetros mínimos da OWASP: 19 MiB, 2 iterações.
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

@Injectable()
export class PasswordHasher implements OnModuleInit {
  // Hash de uma senha qualquer: quando o e-mail não existe, verificamos contra ele para o
  // tempo de resposta ser o mesmo e não revelar quais e-mails estão cadastrados.
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash('dummy-password-for-timing', OPTIONS);
  }

  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      const ok = await verify(passwordHash ?? this.dummyHash, password);
      return passwordHash !== null && ok;
    } catch {
      return false;
    }
  }
}
