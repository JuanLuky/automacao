import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<Omit<User, 'senha_hash'>> {
    const existente = await this.findByEmail(dto.email);
    if (existente) {
      throw new ConflictException('Já existe um usuário com esse email.');
    }

    const senha_hash = await bcrypt.hash(dto.senha, SALT_ROUNDS);

    const user = this.usersRepository.create({
      nome: dto.nome,
      email: dto.email,
      senha_hash,
      departamento_id: dto.departamento_id ?? null,
      role: dto.role,
    });

    const salvo = await this.usersRepository.save(user);
    const { senha_hash: _senha_hash, ...semSenha } = salvo;
    return semSenha;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findAll(): Promise<Omit<User, 'senha_hash'>[]> {
    const users = await this.usersRepository.find({ relations: ['departamento'] });
    return users.map(({ senha_hash: _senha_hash, ...semSenha }) => semSenha);
  }
}
