import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  // O retorno daqui vira "req.user" em qualquer rota protegida por JwtAuthGuard
  async validate(payload: any) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      departamento_id: payload.departamento_id,
    };
  }
}
