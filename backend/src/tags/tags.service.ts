import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity';
import { CreateTagDto } from './dto/create-tag.dto';
import { UpdateTagDto } from './dto/update-tag.dto';

export type TagComUso = Tag & { total_clientes: number };

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  // Cada etiqueta vem com quantos clientes a têm hoje. O catálogo é
  // pequeno (dezenas), então uma agregação só resolve — evita o painel
  // fazer N chamadas ou carregar client_tags inteira só pra contar. É
  // LEFT JOIN de propósito: etiqueta sem nenhum cliente precisa aparecer
  // na lista com 0, não sumir.
  async findAll(): Promise<TagComUso[]> {
    const { entities, raw } = await this.tagsRepository
      .createQueryBuilder('tag')
      .leftJoin('client_tags', 'ct', 'ct.tag_id = tag.id')
      .addSelect('COUNT(ct.id)', 'total_clientes')
      .groupBy('tag.id')
      .orderBy('tag.nome', 'ASC')
      .getRawAndEntities();

    // COUNT no Postgres volta como bigint, que o driver entrega em string —
    // sem o Number() o frontend receberia "3" e quebraria comparação numérica.
    return entities.map((tag, i) => ({
      ...tag,
      total_clientes: Number(raw[i]?.total_clientes ?? 0),
    }));
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
