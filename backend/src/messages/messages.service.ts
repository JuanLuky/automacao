import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Message, MessageOrigin, MessageTipo } from "./entities/message.entity";
import { Conversation } from "../conversations/entities/conversation.entity";
import { CreateMessageDto } from "./dto/create-message.dto";
import { EventsGateway } from "../websocket/events.gateway";
import { EvolutionService } from "../integrations/evolution/evolution.service";
import { MediaStorageService } from "./media-storage.service";

const LEGENDA_PADRAO_POR_TIPO: Record<string, string> = {
  [MessageTipo.IMAGEM]: "[imagem]",
  [MessageTipo.AUDIO]: "[áudio]",
  [MessageTipo.DOCUMENTO]: "[documento]",
};

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    private readonly eventsGateway: EventsGateway,
    private readonly evolutionService: EvolutionService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  findByConversation(conversationId: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: { conversation_id: conversationId },
      order: { criado_em: "ASC" },
      relations: ["atendente", "atendente.departamento"],
    });
  }

  async getMedia(
    conversationId: string,
    id: string,
  ): Promise<{ buffer: Buffer; mimetype: string }> {
    const mensagem = await this.messagesRepository.findOne({
      where: { id, conversation_id: conversationId },
    });

    if (!mensagem || mensagem.tipo === MessageTipo.TEXTO || !mensagem.midia_path) {
      throw new NotFoundException("Mídia não encontrada.");
    }

    const buffer = await this.mediaStorage.ler(mensagem.midia_path);
    return {
      buffer,
      mimetype: mensagem.midia_mimetype ?? "application/octet-stream",
    };
  }

  async create(
    conversationId: string,
    dto: CreateMessageDto,
  ): Promise<Message> {
    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
      relations: ["atendente", "atendente.departamento"],
    });

    if (!conversa) {
      throw new NotFoundException("Conversa não encontrada.");
    }

    const tipo = dto.tipo ?? MessageTipo.TEXTO;
    if (tipo === MessageTipo.AUDIO && dto.origem === MessageOrigin.ATENDENTE) {
      // v1 só recebe áudio do cliente — atendente manda imagem/documento,
      // gravar/enviar nota de voz pelo painel fica fora de escopo.
      throw new BadRequestException(
        "Envio de áudio pelo atendente não é suportado.",
      );
    }

    // Gerado por nós (em vez de deixar o Postgres gerar) porque o nome do
    // arquivo em disco precisa bater com o id da própria mensagem — ver
    // MediaStorageService.
    const id = randomUUID();

    let midiaPath: string | null = null;
    if (tipo !== MessageTipo.TEXTO && dto.midia_base64 && dto.midia_mimetype) {
      const salvo = await this.mediaStorage.salvar(
        id,
        tipo,
        dto.midia_base64,
        dto.midia_mimetype,
      );
      midiaPath = salvo.path;
    }

    // Pra texto puro o comportamento é idêntico a antes (sem trim/fallback);
    // só mensagens de mídia sem legenda ganham um texto de exibição padrão.
    const textoExibicao =
      tipo === MessageTipo.TEXTO
        ? dto.mensagem
        : dto.mensagem.trim() || LEGENDA_PADRAO_POR_TIPO[tipo];

    const mensagem = await this.messagesRepository.save(
      this.messagesRepository.create({
        id,
        conversation_id: conversationId,
        origem: dto.origem,
        mensagem: textoExibicao,
        tipo,
        midia_path: midiaPath,
        midia_mimetype: midiaPath ? dto.midia_mimetype ?? null : null,
        midia_nome_arquivo: midiaPath ? dto.midia_nome_arquivo ?? null : null,
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
      const formatarNome = (nome: string): string => {
        const conectivos = ["da", "de", "do", "dos", "das"];

        return nome
          .trim()
          .toLowerCase()
          .split(/\s+/)
          .filter((parte) => !conectivos.includes(parte))
          .slice(0, 2)
          .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
          .join(" ");
      };

      const assinatura = conversa.atendente
        ? `*${formatarNome(conversa.atendente.nome)}${
            conversa.atendente.departamento
              ? ` - ${conversa.atendente.departamento.nome}:`
              : ":"
          }*`
        : null;

      const textoWhatsapp = assinatura
        ? `${assinatura}\n\n${textoExibicao}`
        : textoExibicao;

      if (
        tipo !== MessageTipo.TEXTO &&
        dto.midia_base64 &&
        dto.midia_mimetype
      ) {
        await this.evolutionService.enviarMidia(dto.instance, conversa.telefone, {
          mediatype: tipo === MessageTipo.IMAGEM ? "image" : "document",
          mimetype: dto.midia_mimetype,
          caption: textoWhatsapp,
          fileName: dto.midia_nome_arquivo,
          mediaBase64: dto.midia_base64,
        });
      } else {
        await this.evolutionService.enviarMensagem(
          dto.instance,
          conversa.telefone,
          textoWhatsapp,
        );
      }
    }

    // cliente_nome/conversa_atendente_id só existem no payload do socket (não
    // persistidos em Message) — dão pro frontend montar a notificação
    // ("Nova mensagem de Fulano") e decidir de quem é a conversa sem precisar
    // buscar isso separadamente. midia_path fica de fora — é implementação
    // interna do storage; o frontend busca o arquivo pelo endpoint dedicado.
    const { midia_path: _midiaPath, ...mensagemSemPath } = mensagem;
    this.eventsGateway.emitNovaMensagem({
      ...mensagemSemPath,
      cliente_nome: conversa.cliente_nome,
      conversa_atendente_id: conversa.atendente_id,
    });
    return mensagem;
  }
}
