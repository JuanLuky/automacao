import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message, MessageOrigin } from './entities/message.entity';
import { Conversation } from '../conversations/entities/conversation.entity';
import { CreateMessageDto } from './dto/create-message.dto';
import { EventsGateway } from '../websocket/events.gateway';
import { EvolutionService } from '../integrations/evolution/evolution.service';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly eventsGateway: EventsGateway,
    private readonly evolutionService: EvolutionService,
  ) {}

  findByConversation(conversationId: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: { conversation_id: conversationId },
      order: { criado_em: 'ASC' },
      relations: ['atendente', 'atendente.departamento'],
    });
  }

  async create(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<Message> {
    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
      relations: ['atendente', 'atendente.departamento'],
    });

    if (!conversa) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const mensagem = await this.messagesRepository.save(
      this.messagesRepository.create({
        conversation_id: conversationId,
        origem: dto.origem,
        mensagem: dto.mensagem,
        // O responsável é sempre quem está com a conversa assumida agora —
        // não existe seleção de atendente no payload (rota também é
        // chamada pelo n8n, sem noção de usuário logado).
        atendente_id:
          dto.origem === MessageOrigin.ATENDENTE ? conversa.atendente_id : null,
      }),
    );

    // save() não retorna a relação carregada — anexa em memória pra ir
    // completa no evento de socket e na resposta HTTP.
    if (dto.origem === MessageOrigin.ATENDENTE) {
      mensagem.atendente = conversa.atendente;
    }

    // Só dispara envio real ao WhatsApp quando é o atendente respondendo.
    // Mensagens de origem "cliente" já chegaram pelo WhatsApp (via n8n) —
    // reenviá-las de volta seria um eco.
    if (dto.origem === MessageOrigin.ATENDENTE) {
      if (!dto.instance) {
        throw new BadRequestException(
          'Campo "instance" é obrigatório para mensagens do atendente.',
        );
      }
      // Assinatura "Nome - SETOR" só no texto enviado ao WhatsApp — o
      // registro em banco (dto.mensagem) fica limpo, já que o frontend
      // mostra o atendente separadamente via mensagem.atendente.
      const assinatura = conversa.atendente
        ? `*${conversa.atendente.nome}${conversa.atendente.departamento ? ` - ${conversa.atendente.departamento.nome}:` : ''}*`
        : null;
      const textoWhatsapp = assinatura
        ? `${assinatura}\n\n${dto.mensagem}`
        : dto.mensagem;

      await this.evolutionService.enviarMensagem(
        dto.instance,
        conversa.telefone,
        textoWhatsapp,
      );
    }

    this.eventsGateway.emitNovaMensagem(mensagem);
    return mensagem;
  }
}
