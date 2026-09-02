import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { randomUUID } from "crypto";
import { Message, MessageOrigin, MessageTipo } from "./entities/message.entity";
import { Conversation } from "../conversations/entities/conversation.entity";
import { ConversationTipo } from "../conversations/enums/conversation-tipo.enum";
import { CreateMessageDto } from "./dto/create-message.dto";
import { EventsGateway } from "../websocket/events.gateway";
import { EvolutionService } from "../integrations/evolution/evolution.service";
import { MediaStorageService } from "./media-storage.service";
import { User } from "../users/entities/user.entity";

const LEGENDA_PADRAO_POR_TIPO: Record<string, string> = {
  [MessageTipo.IMAGEM]: "[imagem]",
  [MessageTipo.AUDIO]: "[áudio]",
  [MessageTipo.DOCUMENTO]: "[documento]",
  [MessageTipo.VIDEO]: "[vídeo]",
};

const MEDIATYPE_EVOLUTION_POR_TIPO: Record<
  string,
  "image" | "document" | "video" | "audio"
> = {
  [MessageTipo.IMAGEM]: "image",
  [MessageTipo.DOCUMENTO]: "document",
  [MessageTipo.VIDEO]: "video",
  [MessageTipo.AUDIO]: "audio",
};

// Extraído pra fora de create() pra ser reaproveitado por editar() — a
// mensagem editada precisa manter a mesma assinatura "*Nome - SETOR:*" que
// foi mandada da primeira vez.
function formatarNome(nome: string): string {
  const conectivos = ["da", "de", "do", "dos", "das"];

  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((parte) => !conectivos.includes(parte))
    .slice(0, 2)
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(" ");
}

function montarAssinatura(remetente: User | null): string | null {
  if (!remetente) return null;
  return `*${formatarNome(remetente.nome)}${
    remetente.departamento ? ` - ${remetente.departamento.nome}:` : ":"
  }*`;
}

// remoteJid que a Evolution API exige em Message.key pra editar/apagar: pra
// cliente é o telefone (sem @s.whatsapp.net em Conversation.telefone) com o
// sufixo de JID individual; pra grupo, Conversation.telefone já é o JID
// completo com @g.us (ver Conversation.telefone).
function construirRemoteJid(conversa: Conversation): string {
  return conversa.tipo === ConversationTipo.GRUPO
    ? conversa.telefone
    : `${conversa.telefone}@s.whatsapp.net`;
}

type MessageSemSenha = Omit<Message, "atendente"> & {
  atendente?: Omit<User, "senha_hash"> | null;
};

// Mesmo padrão de UsersService: nunca deixar senha_hash sair na resposta
// HTTP nem no payload do evento de socket.
function semSenha(atendente: User): Omit<User, "senha_hash">;
function semSenha(atendente: User | null): Omit<User, "senha_hash"> | null;
function semSenha(
  atendente: User | null | undefined,
): Omit<User, "senha_hash"> | null | undefined {
  if (!atendente) {
    return atendente;
  }
  const { senha_hash: _senha_hash, ...resto } = atendente;
  return resto;
}

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly eventsGateway: EventsGateway,
    private readonly evolutionService: EvolutionService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  async findByConversation(conversationId: string): Promise<MessageSemSenha[]> {
    const mensagens = await this.messagesRepository.find({
      where: { conversation_id: conversationId },
      order: { criado_em: "ASC" },
      relations: ["atendente", "atendente.departamento"],
    });
    return mensagens.map((mensagem) => ({
      ...mensagem,
      atendente: semSenha(mensagem.atendente),
    }));
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
  ): Promise<MessageSemSenha> {
    // Dedup: o n8n manda evolution_message_id quando registra uma mensagem
    // "fromMe" vinda do webhook — se já existe uma mensagem com esse mesmo
    // id (eco de uma mensagem que o próprio painel acabou de enviar, ver
    // bloco de envio mais abaixo), devolve ela sem criar duplicata nem
    // reemitir o evento de socket.
    if (dto.evolution_message_id) {
      const existente = await this.messagesRepository.findOne({
        where: { evolution_message_id: dto.evolution_message_id },
        relations: ["atendente", "atendente.departamento"],
      });
      if (existente) {
        return { ...existente, atendente: semSenha(existente.atendente) };
      }
    }

    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
      relations: ["atendente", "atendente.departamento"],
    });

    if (!conversa) {
      throw new NotFoundException("Conversa não encontrada.");
    }

    const tipo = dto.tipo ?? MessageTipo.TEXTO;

    // Quem está "respondendo agora": pra conversa de cliente é sempre quem
    // está com ela assumida (não existe seleção de atendente no payload —
    // rota também é chamada pelo n8n, sem noção de usuário logado). Grupo
    // não tem "assumir", então não tem um atendente_id na conversa — quem
    // está respondendo precisa vir explícito no payload (o painel manda o
    // id do usuário logado, ver conversas/[id]/page.tsx). Mensagem
    // origem_externa (enviada direto do celular, fora do painel) não tem
    // remetente conhecido de propósito — ver CreateMessageDto.
    let remetente: User | null = null;
    if (dto.origem === MessageOrigin.ATENDENTE && !dto.origem_externa) {
      if (conversa.tipo === ConversationTipo.GRUPO) {
        if (!dto.atendente_id) {
          throw new BadRequestException(
            'Campo "atendente_id" é obrigatório para responder um grupo.',
          );
        }
        remetente = await this.usersRepository.findOne({
          where: { id: dto.atendente_id },
          relations: ["departamento"],
        });
        if (!remetente) {
          throw new NotFoundException("Atendente informado não encontrado.");
        }
      } else {
        remetente = conversa.atendente ?? null;
      }
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
        atendente_id: remetente ? remetente.id : null,
        // origem_externa já vem com o id da mensagem no WhatsApp (o n8n tira
        // do próprio webhook); mensagem enviada pelo painel só ganha o dela
        // depois, a partir do retorno da Evolution API (ver bloco abaixo).
        evolution_message_id: dto.origem_externa
          ? dto.evolution_message_id ?? null
          : null,
        remetente_nome: dto.remetente_nome ?? null,
        remetente_telefone: dto.remetente_telefone ?? null,
      }),
    );

    // save() não retorna a relação carregada — anexa em memória pra ir
    // completa no evento de socket e na resposta HTTP.
    if (remetente) {
      mensagem.atendente = remetente;
    }

    // Só dispara envio real ao WhatsApp quando é o atendente respondendo
    // pelo painel de verdade. Mensagens de origem "cliente" já chegaram
    // pelo WhatsApp (via n8n) — reenviá-las de volta seria um eco.
    // Mensagem origem_externa já foi entregue fora do sistema (mandada
    // direto do celular conectado) — só registra no histórico, não envia.
    if (dto.origem === MessageOrigin.ATENDENTE && !dto.origem_externa) {
      if (!dto.instance) {
        throw new BadRequestException(
          'Campo "instance" é obrigatório para mensagens do atendente.',
        );
      }
      // Assinatura "Nome - SETOR" só no texto enviado ao WhatsApp — o
      // registro em banco (dto.mensagem) fica limpo, já que o frontend
      // mostra o atendente separadamente via mensagem.atendente.
      const assinatura = montarAssinatura(remetente);

      const textoWhatsapp = assinatura
        ? `${assinatura}\n\n${textoExibicao}`
        : textoExibicao;

      const enviada =
        tipo !== MessageTipo.TEXTO && dto.midia_base64 && dto.midia_mimetype
          ? await this.evolutionService.enviarMidia(
              dto.instance,
              conversa.telefone,
              {
                mediatype: MEDIATYPE_EVOLUTION_POR_TIPO[tipo] ?? "document",
                mimetype: dto.midia_mimetype,
                caption: textoWhatsapp,
                fileName: dto.midia_nome_arquivo,
                mediaBase64: dto.midia_base64,
              },
            )
          : await this.evolutionService.enviarMensagem(
              dto.instance,
              conversa.telefone,
              textoWhatsapp,
            );

      // Guarda o id que a Evolution API devolveu pra essa mensagem — é o
      // que permite reconhecer o eco dela (webhook "fromMe") mais tarde e
      // não duplicar no histórico (ver dedup no início deste método).
      if (enviada.id) {
        mensagem.evolution_message_id = enviada.id;
        await this.messagesRepository.update(mensagem.id, {
          evolution_message_id: enviada.id,
        });
      }
    }

    // cliente_nome/conversa_atendente_id só existem no payload do socket (não
    // persistidos em Message) — dão pro frontend montar a notificação
    // ("Nova mensagem de Fulano") e decidir de quem é a conversa sem precisar
    // buscar isso separadamente. midia_path/evolution_message_id ficam de
    // fora — são implementação interna (storage e dedup, respectivamente),
    // sem uso nenhum no frontend.
    const {
      midia_path: _midiaPath,
      evolution_message_id: _evolutionMessageId,
      atendente,
      ...mensagemSemPath
    } = mensagem;
    const atendenteSemSenha = semSenha(atendente);
    this.eventsGateway.emitNovaMensagem({
      ...mensagemSemPath,
      atendente: atendenteSemSenha,
      cliente_nome: conversa.cliente_nome,
      conversa_atendente_id: conversa.atendente_id,
      // Status/tipo/setor da conversa — só no payload do socket (mesmo
      // espírito de cliente_nome/conversa_atendente_id acima), pra
      // NotificationsProvider decidir se notifica sem precisar buscar a
      // conversa de novo: mensagem em conversa "aguardando" só interessa
      // pra quem vê aquele setor na fila; "grupo" interessa a todo mundo.
      conversa_status: conversa.status,
      conversa_tipo: conversa.tipo,
      conversa_departamento_id: conversa.departamento_id,
    });
    return { ...mensagem, atendente: atendenteSemSenha };
  }

  // Busca a mensagem e garante as regras comuns a editar()/apagar(): só
  // mensagem de origem = atendente, e só o próprio atendente que mandou
  // (não vale editar/apagar mensagem de colega, nem mensagem de cliente ou
  // do sistema/bot). "acao" é só pra mensagem de erro específica.
  private async buscarMensagemPropria(
    conversationId: string,
    messageId: string,
    atendenteId: string,
    acao: "editar" | "apagar",
  ): Promise<Message> {
    const mensagem = await this.messagesRepository.findOne({
      where: { id: messageId, conversation_id: conversationId },
      relations: ["atendente", "atendente.departamento"],
    });
    if (!mensagem) {
      throw new NotFoundException("Mensagem não encontrada.");
    }
    if (mensagem.origem !== MessageOrigin.ATENDENTE) {
      throw new ForbiddenException(
        "Só é possível editar/apagar mensagens enviadas pelo atendente.",
      );
    }
    if (mensagem.atendente_id !== atendenteId) {
      throw new ForbiddenException(
        `Só é possível ${acao} mensagens enviadas por você.`,
      );
    }
    if (mensagem.apagado_em) {
      throw new BadRequestException("Mensagem já apagada.");
    }
    if (!mensagem.evolution_message_id) {
      // Mensagem antiga (anterior ao dedup por evolution_message_id) ou
      // caso raro em que o envio original não devolveu id — sem ele não dá
      // pra identificar a mensagem pra Evolution API editar/apagar no
      // WhatsApp de verdade.
      throw new BadRequestException(
        "Essa mensagem não pode ser editada/apagada no WhatsApp (sem identificador do WhatsApp).",
      );
    }
    return mensagem;
  }

  // Corrige erro de digitação: edita o texto tanto no WhatsApp do cliente
  // (Evolution API) quanto no histórico salvo. Só mensagem de texto — a
  // Evolution API/WhatsApp não editam legenda de mídia.
  async editar(
    conversationId: string,
    messageId: string,
    atendenteId: string,
    novoTexto: string,
    instance: string,
  ): Promise<MessageSemSenha> {
    const mensagem = await this.buscarMensagemPropria(
      conversationId,
      messageId,
      atendenteId,
      "editar",
    );
    if (mensagem.tipo !== MessageTipo.TEXTO) {
      throw new BadRequestException(
        "Só é possível editar mensagens de texto.",
      );
    }

    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
    });
    if (!conversa) {
      throw new NotFoundException("Conversa não encontrada.");
    }

    const assinatura = montarAssinatura(mensagem.atendente ?? null);
    const textoWhatsapp = assinatura ? `${assinatura}\n\n${novoTexto}` : novoTexto;

    await this.evolutionService.editarMensagem(
      instance,
      conversa.telefone,
      construirRemoteJid(conversa),
      mensagem.evolution_message_id as string,
      textoWhatsapp,
    );

    mensagem.mensagem = novoTexto;
    mensagem.editado_em = new Date();
    await this.messagesRepository.update(mensagem.id, {
      mensagem: novoTexto,
      editado_em: mensagem.editado_em,
    });

    const atendenteSemSenha = semSenha(mensagem.atendente ?? null);
    this.eventsGateway.emitMensagemEditada({
      id: mensagem.id,
      conversation_id: conversationId,
      mensagem: novoTexto,
      editado_em: mensagem.editado_em,
    });
    return { ...mensagem, atendente: atendenteSemSenha };
  }

  // Corrige erro de envio: apaga a mensagem "para todos" no WhatsApp do
  // cliente (Evolution API) e marca como apagada no histórico. Mantém o
  // texto original em banco (auditoria interna) — quem esconde o conteúdo
  // na tela é o frontend, a partir de apagado_em preenchido.
  async apagar(
    conversationId: string,
    messageId: string,
    atendenteId: string,
    instance: string,
  ): Promise<MessageSemSenha> {
    const mensagem = await this.buscarMensagemPropria(
      conversationId,
      messageId,
      atendenteId,
      "apagar",
    );

    const conversa = await this.conversationsRepository.findOne({
      where: { id: conversationId },
    });
    if (!conversa) {
      throw new NotFoundException("Conversa não encontrada.");
    }

    await this.evolutionService.apagarMensagemParaTodos(
      instance,
      construirRemoteJid(conversa),
      mensagem.evolution_message_id as string,
    );

    mensagem.apagado_em = new Date();
    await this.messagesRepository.update(mensagem.id, {
      apagado_em: mensagem.apagado_em,
    });

    const atendenteSemSenha = semSenha(mensagem.atendente ?? null);
    this.eventsGateway.emitMensagemApagada({
      id: mensagem.id,
      conversation_id: conversationId,
      apagado_em: mensagem.apagado_em,
    });
    return { ...mensagem, atendente: atendenteSemSenha };
  }
}
