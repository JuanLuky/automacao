import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleLabels } from './entities/role-labels.entity';
import { UpdateRoleLabelsDto } from './dto/update-role-labels.dto';

// Default em memória, usado só se a tabela estiver vazia (seed não rodou
// ainda) — mesmo padrão de BUSINESS_HOURS_PADRAO.
export const ROLE_LABELS_PADRAO = {
  atendente: 'Atendente',
  supervisor: 'Supervisor',
  admin: 'Administrador',
};

type RoleLabelsConfig = Pick<RoleLabels, 'atendente' | 'supervisor' | 'admin'>;

@Injectable()
export class RoleLabelsService {
  constructor(
    @InjectRepository(RoleLabels)
    private readonly roleLabelsRepository: Repository<RoleLabels>,
  ) {}

  async obter(): Promise<RoleLabels | RoleLabelsConfig> {
    const [config] = await this.roleLabelsRepository.find({ take: 1 });
    return config ?? ROLE_LABELS_PADRAO;
  }

  async atualizar(dto: UpdateRoleLabelsDto): Promise<RoleLabels> {
    let [config] = await this.roleLabelsRepository.find({ take: 1 });
    if (!config) {
      config = this.roleLabelsRepository.create(ROLE_LABELS_PADRAO);
    }
    Object.assign(config, dto);
    return this.roleLabelsRepository.save(config);
  }
}
