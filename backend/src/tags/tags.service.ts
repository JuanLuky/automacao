import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  findAll(): Promise<Tag[]> {
    return this.tagsRepository.find({ order: { nome: 'ASC' } });
  }

  private async garantirNomeDisponivel(nome: string, idAtual?: string): Promise<void> {
    const existente = await this.tagsRepository.findOne({ where: { nome } });
    if (existente && existente.id !== idAtual) {
      throw new BadRequestException('Já existe uma etiqueta com esse nome.');
    }
  }

  async create(dto: CreateTagDto): Promise<Tag> {
    const nome = dto.nome.trim();
    await this.garantirNomeDisponivel(nome);
    return this.tagsRepository.save(
      this.tagsRepository.create({ nome, cor: dto.cor }),
    );
  }

  async update(id: string, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.tagsRepository.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Etiqueta não encontrada.');
    }

    if (dto.nome !== undefined) {
      const nome = dto.nome.trim();
      await this.garantirNomeDisponivel(nome, id);
      tag.nome = nome;
    }
    if (dto.cor !== undefined) {
      tag.cor = dto.cor;
    }

    return this.tagsRepository.save(tag);
  }

  async remove(id: string): Promise<void> {
    // Hard delete — client_tags que apontam pra essa etiqueta somem junto
    // via ON DELETE CASCADE (ver migration), não tem "desfazer".
    const resultado = await this.tagsRepository.delete(id);
    if (resultado.affected === 0) {
      throw new NotFoundException('Etiqueta não encontrada.');
    }
  }
}
