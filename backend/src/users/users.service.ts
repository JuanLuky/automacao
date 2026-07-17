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

  async create(dto: CreateUserDto): Promise<User> {
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

    return this.usersRepository.save(user);
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find({ relations: ['departamento'] });
  }
}
