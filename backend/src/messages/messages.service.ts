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
    });
  }

  async create(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<Message> {
    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversa) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const mensagem = await this.messagesRepository.save(
      this.messagesRepository.create({
        conversation_id: conversationId,
        origem: dto.origem,
        mensagem: dto.mensagem,
      }),
    );

    // Só dispara envio real ao WhatsApp quando é o atendente respondendo.
    // Mensagens de origem "cliente" já chegaram pelo WhatsApp (via n8n) —
    // reenviá-las de volta seria um eco.
    if (dto.origem === MessageOrigin.ATENDENTE) {
      if (!dto.instance) {
        throw new BadRequestException(
          'Campo "instance" é obrigatório para mensagens do atendente.',
        );
      }
      await this.evolutionService.enviarMensagem(
        dto.instance,
        conversa.telefone,
        dto.mensagem,
      );
    }

    this.eventsGateway.emitNovaMensagem(mensagem);
    return mensagem;
  }
}
