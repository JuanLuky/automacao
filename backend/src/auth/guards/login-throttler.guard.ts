import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Limite de tentativas do POST /auth/login. A chave é IP + e-mail, não só o
// IP: no dev (Docker Desktop) e numa empresa atrás de um NAT, todo mundo
// chega com o mesmo IP — só por IP, um atendente errando a senha travaria
// o login do escritório inteiro. Com o e-mail na chave, quem tenta adivinhar
// a senha de uma conta continua limitado, e os outros entram normalmente.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    return `${req.ip}:${email}`;
  }
}
