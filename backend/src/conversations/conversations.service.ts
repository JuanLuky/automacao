import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationStatus } from './enums/conversation-status.enum';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { TransferConversationDto } from './dto/transfer-conversation.dto';
import { Message, MessageOrigin } from '../messages/entities/message.entity';
import { EventsGateway } from '../websocket/events.gateway';

function inicioDoDiaLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0);
}

function fimDoDiaLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999);
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    private readonly eventsGateway: EventsGateway,
  ) {}

  // Sem "pagina"/"por_pagina" devolve o array completo (comportamento
  // original, usado pelo dashboard e por getConversation no frontend, que
  // dependem da lista inteira). Com os dois presentes, devolve paginado —
  // usado pelas abas da fila, que só herdam o pequeno risco de paginação
  // client-side ficar pesada quando "finalizadas" acumular muitos registros.
  findAll(filtros: {
    status?: ConversationStatus;
    departamento_id?: string;
    busca?: string;
    data_inicio?: string;
    data_fim?: string;
    pagina?: number;
    por_pagina?: number;
  }) {
    const qb = this.conversationsRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.departamento', 'departamento')
      .leftJoinAndSelect('conversation.atendente', 'atendente')
      .orderBy('conversation.criado_em', 'ASC');

    if (filtros.status) {
      qb.andWhere('conversation.status = :status', { status: filtros.status });
    }
    if (filtros.departamento_id) {
      qb.andWhere('conversation.departamento_id = :departamento_id', {
        departamento_id: filtros.departamento_id,
      });
    }
    // Busca por nome do cliente ou telefone — usado pela tela de conversas
    // finalizadas, pra achar "aquela conversa de terça com o cliente X".
    if (filtros.busca) {
      qb.andWhere(
        '(conversation.cliente_nome ILIKE :busca OR conversation.telefone ILIKE :busca)',
        { busca: `%${filtros.busca}%` },
      );
    }
    // Filtra pela data de criação (dia local do processo, ver CLAUDE.md
    // sobre timestamptz/timezone) — não pela data de finalização, pra também
    // funcionar em conversas que ainda não terminaram.
    //
    // "new Date('YYYY-MM-DD')" é interpretado como meia-noite em UTC (spec do
    // JS), não no fuso local — combinado com o processo rodando em
    // America/Sao_Paulo (UTC-3), um .setHours(0,0,0,0) em cima disso ajusta a
    // hora local mas acaba caindo no dia anterior (a meia-noite UTC já
    // "virou" 21h do dia anterior aqui). Construindo o Date a partir dos
    // componentes ano/mês/dia (em vez de fazer parse da string), o horário
    // 00:00/23:59 já nasce no fuso local certo.
    if (filtros.data_inicio) {
      qb.andWhere('conversation.criado_em >= :data_inicio', {
        data_inicio: inicioDoDiaLocal(filtros.data_inicio),
      });
    }
    if (filtros.data_fim) {
      qb.andWhere('conversation.criado_em <= :data_fim', {
        data_fim: fimDoDiaLocal(filtros.data_fim),
      });
    }

    if (!filtros.pagina || !filtros.por_pagina) {
      return qb.getMany();
    }

    const pagina = Math.max(1, filtros.pagina);
    const porPagina = Math.max(1, filtros.por_pagina);

    return qb
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount()
      .then(([dados, total]) => ({ dados, total, pagina, por_pagina: porPagina }));
  }

  // Usado pelo n8n para saber se já existe uma conversa em aberto para o telefone.
  // "Em aberto" = qualquer status diferente de finalizado.
  async findConversaAtivaPorTelefone(
    telefone: string,
  ): Promise<Conversation> {
    const conversa = await this.conversationsRepository
      .createQueryBuilder('conversation')
      .where('conversation.telefone = :telefone', { telefone })
      .andWhere('conversation.status != :status', {
        status: ConversationStatus.FINALIZADO,
      })
      .orderBy('conversation.criado_em', 'DESC')
      .getOne();

    if (!conversa) {
      throw new NotFoundException('Nenhuma conversa ativa para esse telefone.');
    }

    return conversa;
  }

  async create(dto: CreateConversationDto): Promise<Conversation> {
    const conversa = this.conversationsRepository.create({
      telefone: dto.telefone,
      cliente_nome: dto.cliente_nome,
      departamento_id: dto.departamento_id,
      status: ConversationStatus.AGUARDANDO,
    });

    const salva = await this.conversationsRepository.save(conversa);

    if (dto.mensagem_inicial) {
      await this.messagesRepository.save(
        this.messagesRepository.create({
          conversation_id: salva.id,
          origem: MessageOrigin.CLIENTE,
          mensagem: dto.mensagem_inicial,
        }),
      );
    }

    this.eventsGateway.emitNovaConversa(salva);
    return salva;
  }

  async assumir(id: string, atendenteId: string): Promise<Conversation> {
    const conversa = await this.buscarOuFalhar(id);

    if (conversa.status !== ConversationStatus.AGUARDANDO) {
      throw new BadRequestException(
        'Só é possível assumir conversas com status "aguardando".',
      );
    }

    conversa.status = ConversationStatus.EM_ATENDIMENTO;
    conversa.atendente_id = atendenteId;

    const atualizada = await this.conversationsRepository.save(conversa);
    this.eventsGateway.emitConversaAtualizada(atualizada);
    return atualizada;
  }

  async transferir(
    id: string,
    dto: TransferConversationDto,
  ): Promise<Conversation> {
    const conversa = await this.buscarOuFalhar(id);

    if (conversa.status === ConversationStatus.FINALIZADO) {
      throw new BadRequestException(
        'Não é possível transferir uma conversa já finalizada.',
      );
    }

    conversa.departamento_id = dto.departamento_destino_id;
    conversa.status = ConversationStatus.AGUARDANDO;
    conversa.atendente_id = null;

    const atualizada = await this.conversationsRepository.save(conversa);

    await this.messagesRepository.save(
      this.messagesRepository.create({
        conversation_id: conversa.id,
        origem: MessageOrigin.SISTEMA,
        mensagem: dto.motivo
          ? `Conversa transferida. Motivo: ${dto.motivo}`
          : 'Conversa transferida para outro setor.',
      }),
    );

    this.eventsGateway.emitConversaAtualizada(atualizada);
    return atualizada;
  }

  async finalizar(id: string): Promise<Conversation> {
    const conversa = await this.buscarOuFalhar(id);

    conversa.status = ConversationStatus.FINALIZADO;
    conversa.finalizado_em = new Date();

    const atualizada = await this.conversationsRepository.save(conversa);
    this.eventsGateway.emitConversaFinalizada(atualizada);
    return atualizada;
  }

  private async buscarOuFalhar(id: string): Promise<Conversation> {
    const conversa = await this.conversationsRepository.findOne({
      where: { id },
    });

    if (!conversa) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    return conversa;
  }
}
