import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatusEstado, StatusUpdate } from './entities/status-update.entity';
import { CreateStatusUpdateDto } from './dto/create-status-update.dto';

// Devolvido quando ainda não existe nenhuma entrada (instalação nova, admin
// ainda não postou nada) — evita a página pública quebrar antes do primeiro post.
const STATUS_PADRAO = {
  estado: StatusEstado.OPERACIONAL,
  mensagem: 'Tudo funcionando normalmente.',
  criado_em: null as Date | null,
};

@Injectable()
export class StatusService {
  constructor(
    @InjectRepository(StatusUpdate)
    private readonly statusRepository: Repository<StatusUpdate>,
  ) {}

  async criar(dto: CreateStatusUpdateDto): Promise<StatusUpdate> {
    const update = this.statusRepository.create(dto);
    return this.statusRepository.save(update);
  }

  async atual(): Promise<StatusUpdate | typeof STATUS_PADRAO> {
    const [ultimo] = await this.statusRepository.find({
      order: { criado_em: 'DESC' },
      take: 1,
    });
    return ultimo ?? STATUS_PADRAO;
  }

  historico(limite = 30): Promise<StatusUpdate[]> {
    return this.statusRepository.find({
      order: { criado_em: 'DESC' },
      take: limite,
    });
  }
}
