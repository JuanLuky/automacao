import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClientTag } from './entities/client-tag.entity';
import { Tag } from './entities/tag.entity';
import { CreateClientTagDto } from './dto/create-client-tag.dto';

@Injectable()
export class ClientTagsService {
  constructor(
    @InjectRepository(ClientTag)
    private readonly clientTagsRepository: Repository<ClientTag>,
    @InjectRepository(Tag)
    private readonly tagsRepository: Repository<Tag>,
  ) {}

  // Busca em lote pra evitar N chamadas por linha visível (ex: 5 telefones
  // da página atual de /fila) — devolve um mapa telefone -> Tag[], com
  // array vazio pros telefones sem etiqueta (nunca omite a chave).
  async porTelefones(telefones: string[]): Promise<Record<string, Tag[]>> {
    const mapa: Record<string, Tag[]> = {};
    for (const telefone of telefones) mapa[telefone] = [];
    if (telefones.length === 0) return mapa;

    const rows = await this.clientTagsRepository.find({
      where: { telefone: In(telefones) },
      relations: ['tag'],
      order: { criado_em: 'ASC' },
    });
    for (const row of rows) {
      mapa[row.telefone].push(row.tag);
    }
    return mapa;
  }

  async attach(dto: CreateClientTagDto): Promise<Tag[]> {
    const tag = await this.tagsRepository.findOne({ where: { id: dto.tag_id } });
    if (!tag) {
      throw new NotFoundException('Etiqueta não encontrada.');
    }

    const jaExiste = await this.clientTagsRepository
      .createQueryBuilder('ct')
      .where('ct.telefone = :telefone AND ct.tag_id = :tagId', {
        telefone: dto.telefone,
        tagId: dto.tag_id,
      })
      .getCount();
    if (jaExiste === 0) {
      await this.clientTagsRepository.save(
        this.clientTagsRepository.create({ telefone: dto.telefone, tag }),
      );
    }

    return this.listarPorTelefone(dto.telefone);
  }

  async detach(telefone: string, tagId: string): Promise<Tag[]> {
    await this.clientTagsRepository
      .createQueryBuilder()
      .delete()
      .where('telefone = :telefone AND tag_id = :tagId', { telefone, tagId })
      .execute();
    return this.listarPorTelefone(telefone);
  }

  private async listarPorTelefone(telefone: string): Promise<Tag[]> {
    const rows = await this.clientTagsRepository.find({
      where: { telefone },
      relations: ['tag'],
      order: { criado_em: 'ASC' },
    });
    return rows.map((row) => row.tag);
  }
}
