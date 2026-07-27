import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
    const users = await this.usersRepository.find({
      where: { excluido_em: IsNull() },
      relations: ['departamento'],
    });
    return users.map(({ senha_hash: _senha_hash, ...semSenha }) => semSenha);
  }

  private async findOneAtivo(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id, excluido_em: IsNull() },
    });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }
    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<Omit<User, 'senha_hash'>> {
    const user = await this.findOneAtivo(id);

    if (dto.email && dto.email !== user.email) {
      const existente = await this.findByEmail(dto.email);
      if (existente) {
        throw new ConflictException('Já existe um usuário com esse email.');
      }
      user.email = dto.email;
    }

    if (dto.nome !== undefined) user.nome = dto.nome;
    if (dto.departamento_id !== undefined) user.departamento_id = dto.departamento_id;
    if (dto.role !== undefined) user.role = dto.role;
    if (dto.senha) user.senha_hash = await bcrypt.hash(dto.senha, SALT_ROUNDS);

    const salvo = await this.usersRepository.save(user);
    const { senha_hash: _senha_hash, ...semSenha } = salvo;
    return semSenha;
  }

  async setAtivo(id: string, ativo: boolean): Promise<Omit<User, 'senha_hash'>> {
    const user = await this.findOneAtivo(id);
    user.ativo = ativo;
    const salvo = await this.usersRepository.save(user);
    const { senha_hash: _senha_hash, ...semSenha } = salvo;
    return semSenha;
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOneAtivo(id);
    user.ativo = false;
    user.excluido_em = new Date();
    await this.usersRepository.save(user);
  }
}
