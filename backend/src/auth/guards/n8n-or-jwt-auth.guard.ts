import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { JwtAuthGuard } from './jwt-auth.guard';

// Protege rotas que hoje são chamadas tanto pelo n8n (sem login de
// atendente) quanto pelo painel autenticado — ex: POST /conversations,
// GET /departments. Aceita QUALQUER uma das duas credenciais:
// header "x-n8n-api-key" batendo com N8N_API_KEY, ou um JWT válido do
// painel. Ver CLAUDE.md ("Rotas públicas") pro contexto da decisão.
@Injectable()
export class N8nOrJwtAuthGuard implements CanActivate {
  private readonly jwtGuard = new JwtAuthGuard();

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const chaveRecebida = request.headers['x-n8n-api-key'];
    const chaveEsperada = this.configService.get<string>('N8N_API_KEY');

    if (
      typeof chaveRecebida === 'string' &&
      chaveEsperada &&
      chavesIguais(chaveRecebida, chaveEsperada)
    ) {
      return true;
    }

    return this.jwtGuard.canActivate(context) as
      | boolean
      | Promise<boolean>;
  }
}

function chavesIguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
