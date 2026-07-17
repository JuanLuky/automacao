import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from './entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentsRepository: Repository<Department>,
  ) {}

  findAll(): Promise<Department[]> {
    return this.departmentsRepository.find({ where: { ativo: true } });
  }

  findByCodigo(codigo: string): Promise<Department | null> {
    return this.departmentsRepository.findOne({ where: { codigo } });
  }

  create(nome: string, codigo: string): Promise<Department> {
    const department = this.departmentsRepository.create({ nome, codigo });
    return this.departmentsRepository.save(department);
  }
}
