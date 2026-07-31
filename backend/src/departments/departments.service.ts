import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepository: Repository<Department>,
  ) {}

  // Lista pública (n8n e selects do frontend) — só setores ativos.
  findAll(): Promise<Department[]> {
    return this.departmentsRepository.find({
      where: { ativo: true },
      order: { nome: 'ASC' },
    });
  }

  // Tela de administração precisa ver também os inativos, pra poder reativar.
  findAllIncludingInativos(): Promise<Department[]> {
    return this.departmentsRepository.find({ order: { nome: 'ASC' } });
  }

  findByCodigo(codigo: string): Promise<Department | null> {
    return this.departmentsRepository.findOne({ where: { codigo } });
  }

  private async findOneOuFalhar(id: string): Promise<Department> {
    const department = await this.departmentsRepository.findOne({ where: { id } });
    if (!department) {
      throw new NotFoundException('Setor não encontrado.');
    }
    return department;
  }

  private async garantirCodigoDisponivel(codigo: string, idAtual?: string) {
    const existente = await this.findByCodigo(codigo);
    if (existente && existente.id !== idAtual) {
      throw new ConflictException('Já existe um setor com esse código.');
    }
  }

  async create(dto: CreateDepartmentDto): Promise<Department> {
    await this.garantirCodigoDisponivel(dto.codigo);
    const department = this.departmentsRepository.create({
      nome: dto.nome,
      codigo: dto.codigo,
    });
    return this.departmentsRepository.save(department);
  }

  async update(id: string, dto: UpdateDepartmentDto): Promise<Department> {
    const department = await this.findOneOuFalhar(id);

    if (dto.codigo && dto.codigo !== department.codigo) {
      await this.garantirCodigoDisponivel(dto.codigo, id);
      department.codigo = dto.codigo;
    }
    if (dto.nome !== undefined) department.nome = dto.nome;

    return this.departmentsRepository.save(department);
  }

  async setAtivo(id: string, ativo: boolean): Promise<Department> {
    const department = await this.findOneOuFalhar(id);
    department.ativo = ativo;
    return this.departmentsRepository.save(department);
  }
}
