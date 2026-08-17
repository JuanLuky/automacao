import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './entities/contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    @InjectRepository(Contact)
    private readonly contactsRepository: Repository<Contact>,
  ) {}

  findAll(): Promise<Contact[]> {
    return this.contactsRepository.find({ order: { nome: 'ASC' } });
  }

  private async garantirTelefoneDisponivel(
    telefone: string,
    idAtual?: string,
  ): Promise<void> {
    const existente = await this.contactsRepository.findOne({
      where: { telefone },
    });
    if (existente && existente.id !== idAtual) {
      throw new BadRequestException('Já existe um contato com esse telefone.');
    }
  }

  async create(dto: CreateContactDto): Promise<Contact> {
    const telefone = dto.telefone.trim();
    await this.garantirTelefoneDisponivel(telefone);
    return this.contactsRepository.save(
      this.contactsRepository.create({ nome: dto.nome.trim(), telefone }),
    );
  }

  // Best-effort: linha com telefone já cadastrado (ou campo vazio) é
  // ignorada em vez de interromper o restante do arquivo — pensado pra
  // importar uma planilha exportada de outro lugar, onde algum duplicado
  // já é esperado.
  async import(
    contatos: { nome: string; telefone: string }[],
  ): Promise<{ criados: number; ignorados: number }> {
    let criados = 0;
    let ignorados = 0;
    for (const item of contatos) {
      const nome = item.nome?.trim();
      const telefone = item.telefone?.trim();
      if (!nome || !telefone) {
        ignorados++;
        continue;
      }
      const existente = await this.contactsRepository.findOne({
        where: { telefone },
      });
      if (existente) {
        ignorados++;
        continue;
      }
      await this.contactsRepository.save(
        this.contactsRepository.create({ nome, telefone }),
      );
      criados++;
    }
    return { criados, ignorados };
  }

  async update(id: string, dto: UpdateContactDto): Promise<Contact> {
    const contato = await this.contactsRepository.findOne({ where: { id } });
    if (!contato) {
      throw new NotFoundException('Contato não encontrado.');
    }

    if (dto.telefone !== undefined) {
      const telefone = dto.telefone.trim();
      await this.garantirTelefoneDisponivel(telefone, id);
      contato.telefone = telefone;
    }
    if (dto.nome !== undefined) {
      contato.nome = dto.nome.trim();
    }

    return this.contactsRepository.save(contato);
  }

  async remove(id: string): Promise<void> {
    // Hard delete de verdade (não soft-delete como User) — Contact não é
    // referenciado por FK de nenhuma outra tabela, não existe histórico
    // pra preservar.
    const resultado = await this.contactsRepository.delete(id);
    if (resultado.affected === 0) {
      throw new NotFoundException('Contato não encontrado.');
    }
  }
}
