import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, senha: string) {
    const user = await this.usersService.findByEmail(email);

    // Mensagem genérica de propósito: não revelar se o email existe ou não
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      departamento_id: user.departamento_id,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        departamento_id: user.departamento_id,
      },
    };
  }
}
