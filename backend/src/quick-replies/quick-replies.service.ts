import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuickReply } from './entities/quick-reply.entity';
import { CreateQuickReplyDto } from './dto/create-quick-reply.dto';
import { UpdateQuickReplyDto } from './dto/update-quick-reply.dto';

@Injectable()
export class QuickRepliesService {
  constructor(
    @InjectRepository(QuickReply)
    private readonly quickRepliesRepository: Repository<QuickReply>,
  ) {}

  findAll(): Promise<QuickReply[]> {
    return this.quickRepliesRepository.find({
      order: { ordem: 'ASC', criado_em: 'ASC' },
    });
  }

  create(dto: CreateQuickReplyDto): Promise<QuickReply> {
    return this.quickRepliesRepository.save(
      this.quickRepliesRepository.create({
        categoria: dto.categoria.trim(),
        texto: dto.texto.trim(),
        ordem: dto.ordem ?? 0,
      }),
    );
  }

  async update(id: string, dto: UpdateQuickReplyDto): Promise<QuickReply> {
    const item = await this.quickRepliesRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException('Resposta rápida não encontrada.');
    }

    if (dto.categoria !== undefined) item.categoria = dto.categoria.trim();
    if (dto.texto !== undefined) item.texto = dto.texto.trim();
    if (dto.ordem !== undefined) item.ordem = dto.ordem;

    return this.quickRepliesRepository.save(item);
  }

  async remove(id: string): Promise<void> {
    // Hard delete de verdade — sem FK apontando pra cá, sem histórico pra
    // preservar (mesmo padrão de Contact).
    const resultado = await this.quickRepliesRepository.delete(id);
    if (resultado.affected === 0) {
      throw new NotFoundException('Resposta rápida não encontrada.');
    }
  }
}
