import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationStatus } from './enums/conversation-status.enum';
import { ConversationTipo } from './enums/conversation-tipo.enum';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import {
  BotSessionMensagem,
  BotSessionsService,
} from '../bot-sessions/bot-sessions.service';
import { TransferConversationDto } from './dto/transfer-conversation.dto';
import { Message, MessageOrigin } from '../messages/entities/message.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { EvolutionService } from '../integrations/evolution/evolution.service';

function inicioDoDiaLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 0, 0, 0, 0);
}

function fimDoDiaLocal(dataIso: string): Date {
  const [ano, mes, dia] = dataIso.split('-').map(Number);
  return new Date(ano, mes - 1, dia, 23, 59, 59, 999);
}

// Telefone digitado à mão vem de tudo quanto é jeito: "(98) 99123-4567",
// "98991234567", "5598991234567". Tira tudo que não é dígito e assume
// Brasil quando veio só DDD + número (10 ou 11 dígitos) — é o único
// mercado do produto hoje, e sem DDI a Evolution API rejeita. Com 12+
// dígitos presume que o DDI já veio e não mexe. O julgamento final de
// "esse número existe?" é da Evolution API, não daqui.
function normalizarTelefoneDigitado(entrada: string): string {
  const digitos = entrada.replace(/\D/g, '');
  if (digitos.length === 10 || digitos.length === 11) {
    return `55${digitos}`;
  }
  return digitos;
}

// Conversa + a última mensagem trocada, pra lista da fila mostrar prévia
// sem precisar abrir o atendimento. Campo transiente: não existe na
// entidade nem no banco, é montado na leitura.
export type ConversationComPreview = Conversation & {
  ultima_mensagem: {
    texto: string;
    origem: MessageOrigin;
    criado_em: Date;
  } | null;
};

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationsRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messagesRepository: Repository<Message>,
    private readonly eventsGateway: EventsGateway,
    private readonly evolutionService: EvolutionService,
    private readonly botSessionsService: BotSessionsService,
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
    tipo?: ConversationTipo;
    tag_id?: string;
    sem_ativo?: boolean;
  }) {
    // "aguardando" é fila de verdade — quem chegou primeiro deve aparecer
    // primeiro (FIFO), senão o atendente atenderia fora de ordem. Todo o
    // resto (em_atendimento, grupo, sem filtro de status) é histórico/
    // painel de trabalho, onde o mais recente primeiro é o que faz
    // sentido, ordenado por quando a conversa começou (criado_em).
    //
    // "finalizado" é o único caso que precisa de uma coluna diferente:
    // ordenar por criado_em ainda erra pra uma conversa REABERTA e
    // finalizada de novo — o criado_em original fica velho (é de quando
    // ela começou, não muda ao reabrir), então uma conversa finalizada há
    // pouco tempo mas criada há dias ficava enterrada embaixo de outras
    // criadas mais recentemente porém finalizadas há mais tempo (bug real,
    // reproduzido com uma conversa de teste "reabrir" — reabriu e
    // finalizou de novo hoje, mas continuava aparecendo abaixo de
    // conversas mais antigas na lista por causa do criado_em antigo).
    // finalizado_em reflete a última vez que ela foi encerrada, então é a
    // coluna certa pra "mais recente primeiro" nessa aba.
    const ordenarPorFinalizacao = filtros.status === ConversationStatus.FINALIZADO;
    const qb = this.conversationsRepository
      .createQueryBuilder('conversation')
      .leftJoinAndSelect('conversation.departamento', 'departamento')
      .leftJoinAndSelect('conversation.atendente', 'atendente')
      .orderBy(
        ordenarPorFinalizacao ? 'conversation.finalizado_em' : 'conversation.criado_em',
        filtros.status === ConversationStatus.AGUARDANDO ? 'ASC' : 'DESC',
        ordenarPorFinalizacao ? 'NULLS LAST' : undefined,
      );

    // Sem "tipo" explícito, mantém o comportamento de sempre (só cliente) —
    // preserva a fila/dashboard existentes sem precisar tocar em cada
    // chamada. A tela /grupos passa tipo=grupo explicitamente.
    qb.andWhere('conversation.tipo = :tipo', {
      tipo: filtros.tipo ?? ConversationTipo.CLIENTE,
    });

    if (filtros.status) {
      qb.andWhere('conversation.status = :status', { status: filtros.status });
    }
    if (filtros.departamento_id) {
      qb.andWhere('conversation.departamento_id = :departamento_id', {
        departamento_id: filtros.departamento_id,
      });
    }
    // Esconde o histórico de quem já voltou: um cliente com atendimento
    // em aberto não deve aparecer também na aba de finalizados — pro
    // atendente ele é UMA pessoa, e o lugar dela é onde está agora. Sem
    // isso o mesmo nome saía em duas abas ao mesmo tempo.
    if (filtros.sem_ativo) {
      qb.andWhere(
        `NOT EXISTS (SELECT 1 FROM conversations ativa
                      WHERE ativa.telefone = conversation.telefone
                        AND ativa.status != :statusFinalizado)`,
        { statusFinalizado: ConversationStatus.FINALIZADO },
      );
    }
    // Filtra pelas etiquetas do CLIENTE (client_tags casa por telefone, não
    // por conversation_id — ver ClientTag) via EXISTS em vez de JOIN: um
    // cliente com 3 etiquetas apareceria 3 vezes num join, e DISTINCT
    // atrapalharia a paginação do getManyAndCount.
    if (filtros.tag_id) {
      qb.andWhere(
        'EXISTS (SELECT 1 FROM client_tags ct WHERE ct.telefone = conversation.telefone AND ct.tag_id = :tag_id)',
        { tag_id: filtros.tag_id },
      );
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
      return qb.getMany().then((dados) => this.anexarUltimaMensagem(dados));
    }

    const pagina = Math.max(1, filtros.pagina);
    const porPagina = Math.max(1, filtros.por_pagina);

    return qb
      .skip((pagina - 1) * porPagina)
      .take(porPagina)
      .getManyAndCount()
      .then(async ([dados, total]) => ({
        dados: await this.anexarUltimaMensagem(dados),
        total,
        pagina,
        por_pagina: porPagina,
      }));
  }

  // Uma query só pra todas as conversas da página, em vez de uma por linha
  // (a fila mostra 5 por página, mas o dashboard chama sem paginar).
  // DISTINCT ON é específico do Postgres e resolve "a última linha de cada
  // grupo" sem subquery correlacionada nem window function.
  private async anexarUltimaMensagem(
    conversas: Conversation[],
  ): Promise<ConversationComPreview[]> {
    if (conversas.length === 0) return [];

    const ids = conversas.map((c) => c.id);
    // SQL cru (parametrizado) em vez do query builder: o TypeORM escapa a
    // expressão do select como se fosse nome de coluna e gera
    // "DISTINCT ON (...)" inválido — testado, dá "syntax error at or near
    // DISTINCT" e derruba a listagem inteira com 500.
    const linhas: Array<{
      conversation_id: string;
      mensagem: string;
      origem: MessageOrigin;
      criado_em: Date;
    }> = await this.messagesRepository.query(
      `SELECT DISTINCT ON (conversation_id)
              conversation_id, mensagem, origem, criado_em
         FROM messages
        WHERE conversation_id = ANY($1)
        ORDER BY conversation_id, criado_em DESC`,
      [ids],
    );

    const porConversa = new Map(linhas.map((l) => [l.conversation_id, l]));

    return conversas.map((conversa) => {
      const ultima = porConversa.get(conversa.id);
      return {
        ...conversa,
        ultima_mensagem: ultima
          ? {
              texto: ultima.mensagem,
              origem: ultima.origem,
              criado_em: ultima.criado_em,
            }
          : null,
      };
    });
  }

  // Usado pelo n8n para saber se já existe uma conversa em aberto para o telefone.
  // "Em aberto" = qualquer status diferente de finalizado. "texto" é opcional
  // (query param novo, ver ConversationsController) — o n8n manda o texto da
  // mensagem recebida pra alimentar o histórico da aba Bot; sem ele (ex:
  // chamada antiga, ou alguém testando via curl) o comportamento é o mesmo
  // de antes, só sem guardar o texto.
  async findConversaAtivaPorTelefone(
    telefone: string,
    texto?: string,
    nome?: string,
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
      // O n8n consulta esta rota pra CADA mensagem recebida, e só cai aqui
      // quando não há atendimento aberto — ou seja, exatamente quando ele
      // vai responder com o menu de setores. É o gancho perfeito pra saber
      // quem está preso no bot sem precisar mudar o fluxo do n8n.
      await this.botSessionsService.registrarTentativa(telefone, texto, nome);
      throw new NotFoundException('Nenhuma conversa ativa para esse telefone.');
    }

    // Voltou a ter atendimento aberto: não está mais no bot.
    await this.botSessionsService.encerrar(telefone);
    return conversa;
  }

  async create(dto: CreateConversationDto): Promise<Conversation> {
    const tipo = dto.tipo ?? ConversationTipo.CLIENTE;
    const conversa = this.conversationsRepository.create({
      telefone: dto.telefone,
      cliente_nome: dto.cliente_nome,
      tipo,
      // Grupo não tem setor — mesmo que venha algo no DTO, ignora (só
      // tipo = cliente usa departamento_id; ver CreateConversationDto).
      departamento_id: tipo === ConversationTipo.GRUPO ? null : dto.departamento_id,
      status: ConversationStatus.AGUARDANDO,
    });

    const salva = await this.conversationsRepository.save(conversa);

    // Escolheu o setor: sai da aba Bot e entra na fila — e o que ela foi
    // escrevendo enquanto presa lá (ver "Aba Bot" no CLAUDE.md) vira
    // histórico desta conversa, pro atendente ler antes de assumir e saber
    // se precisa transferir de setor. Sem isso o atendente só via o número
    // digitado no menu ("3"), sem nenhum contexto do que a pessoa queria.
    const historico = await this.botSessionsService.consumirHistorico(salva.telefone);
    await this.inserirHistoricoBot(salva.id, historico);

    // dto.mensagem_inicial normalmente É a última mensagem do histórico
    // acima (o texto que validou a escolha do setor) — já foi inserida
    // ali. Só insere separado se não bater (ex: chamada sem passar pelo
    // fluxo normal de bot-session, ou telefone de grupo, que nunca gera
    // sessão de bot).
    const ultimoDoHistorico = historico.at(-1)?.texto?.trim();
    if (dto.mensagem_inicial && dto.mensagem_inicial.trim() !== ultimoDoHistorico) {
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

  // Compartilhado por create() (n8n, cliente escolheu o setor) e iniciar()
  // (atendente puxou alguém da aba Bot) — insere cada mensagem que a
  // pessoa mandou enquanto presa no menu como uma Message normal de
  // origem cliente, com o horário original em que foi escrita (não "agora"
  // — importa pro atendente ver que, por exemplo, a pessoa esperou 10min
  // entre uma tentativa e outra). Só entra um divisor de sistema quando há
  // mais de uma mensagem: pro caso comum (pessoa só digitou o número certo
  // de primeira) isso seria um aviso sem nada de novo pra mostrar.
  private async inserirHistoricoBot(
    conversationId: string,
    historico: BotSessionMensagem[],
  ): Promise<void> {
    if (historico.length === 0) return;

    if (historico.length > 1) {
      const divisor = await this.messagesRepository.save(
        this.messagesRepository.create({
          conversation_id: conversationId,
          origem: MessageOrigin.SISTEMA,
          mensagem: 'Mensagens recebidas antes da escolha do setor:',
        }),
      );
      await this.messagesRepository.update(divisor.id, {
        criado_em: new Date(new Date(historico[0].criado_em).getTime() - 1000),
      });
    }

    for (const item of historico) {
      const mensagem = await this.messagesRepository.save(
        this.messagesRepository.create({
          conversation_id: conversationId,
          // Menu (re)enviado pelo bot entra como sistema — mesma origem do
          // divisor acima, já que não foi nem o cliente nem um atendente
          // quem escreveu. Ver BotSessionsService.registrarMensagemBot.
          origem: item.origem === 'bot' ? MessageOrigin.SISTEMA : MessageOrigin.CLIENTE,
          mensagem: item.texto,
        }),
      );
      // save() já grava com criado_em = agora (via @CreateDateColumn) —
      // o update() em seguida corrige pro horário real em que a pessoa
      // escreveu, preservado no bot_sessions.mensagens.
      await this.messagesRepository.update(mensagem.id, {
        criado_em: new Date(item.criado_em),
      });
    }
  }

  // "Chamar o cliente sem ele chamar": abre um atendimento a partir do
  // painel, em vez de esperar a primeira mensagem cair no n8n. Três
  // cuidados que a rota do n8n (create, acima) não precisa ter:
  //
  // 1. O número é digitado por gente — pode não ter WhatsApp, pode vir com
  //    máscara, pode vir sem DDI. Confere na Evolution API ANTES de gravar
  //    qualquer coisa, pra não encher a fila de conversa fantasma pra
  //    número errado.
  // 2. Grava o telefone do JID devolvido pela Evolution, não o digitado —
  //    ver EvolutionService.verificarNumero pro porquê (nono dígito).
  // 3. Já nasce em_atendimento no nome de quem iniciou: quem chamou o
  //    cliente é quem vai falar com ele. Cair em "aguardando" faria outro
  //    atendente assumir uma conversa que não começou.
  //
  // Não manda mensagem nenhuma: quem envia a primeira é o fluxo normal de
  // POST /conversations/:id/messages (origem = atendente), que já cuida de
  // assinatura, envio pela Evolution, persistência e socket.
  async iniciar(
    dto: StartConversationDto,
    atendenteId: string,
  ): Promise<{ conversa: Conversation; ja_existia: boolean }> {
    const telefoneDigitado = normalizarTelefoneDigitado(dto.telefone);
    if (telefoneDigitado.length < 10) {
      throw new BadRequestException('Número de telefone incompleto.');
    }

    const { existe, telefone } = await this.evolutionService.verificarNumero(
      dto.instance,
      telefoneDigitado,
    );
    if (!existe) {
      throw new BadRequestException(
        'Esse número não tem WhatsApp (ou não foi possível confirmar). Confira o DDD e o número.',
      );
    }

    // Reabrir a mesma conversa em vez de criar uma paralela: duas
    // conversas em aberto pro mesmo telefone quebram o n8n, que resolve o
    // atendimento ativo por telefone (findConversaAtivaPorTelefone) e
    // gravaria a resposta do cliente em só uma delas. Devolve a que já
    // existe, mesmo que seja de outro setor/atendente — o painel avisa em
    // vez de roubar o atendimento de alguém.
    const emAberto = await this.conversationsRepository
      .createQueryBuilder('conversation')
      .where('conversation.telefone = :telefone', { telefone })
      .andWhere('conversation.status != :status', {
        status: ConversationStatus.FINALIZADO,
      })
      .orderBy('conversation.criado_em', 'DESC')
      .getOne();

    if (emAberto) {
      return { conversa: emAberto, ja_existia: true };
    }

    const conversa = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        telefone,
        // undefined (não null) porque Conversation.cliente_nome é tipado
        // como string, mesmo sendo nullable no banco — TypeORM grava NULL.
        cliente_nome: dto.cliente_nome?.trim() || undefined,
        tipo: ConversationTipo.CLIENTE,
        departamento_id: dto.departamento_id,
        status: ConversationStatus.EM_ATENDIMENTO,
        atendente_id: atendenteId,
      }),
    );

    // Vale também pra quem foi puxado da aba Bot por um atendente — o que a
    // pessoa já tinha escrito lá (ver create() acima) vira histórico desta
    // conversa também, mesmo raciocínio: dá pro atendente ler antes de
    // mandar a primeira mensagem.
    const historico = await this.botSessionsService.consumirHistorico(telefone);
    await this.inserirHistoricoBot(conversa.id, historico);

    this.eventsGateway.emitNovaConversa(conversa);
    return { conversa, ja_existia: false };
  }

  // Usada pela tela de chat (não existe GET /conversations/:id — só a lista
  // paginada — este método serve um único registro por id, tanto cliente
  // quanto grupo).
  async buscarPorId(id: string): Promise<Conversation> {
    return this.buscarOuFalhar(id);
  }

  // Nome + foto ao vivo do WhatsApp — nunca persistido (mesmo espírito de
  // ContactsController.whatsapp, ver "Contatos" no CLAUDE.md): grupo usa
  // findGroupInfos (nome = subject, o cliente_nome salvo na criação da
  // conversa costuma ficar vazio pra grupo — não fazia parte do escopo até
  // aqui); conversa 1:1 já tem o nome salvo desde a criação (pushName),
  // então só busca a foto de perfil aqui.
  async buscarInfoWhatsapp(
    id: string,
    instance: string,
  ): Promise<{ nome: string | null; foto_url: string | null }> {
    const conversa = await this.buscarOuFalhar(id);

    if (conversa.tipo === ConversationTipo.GRUPO) {
      const info = await this.evolutionService.getGroupInfo(instance, conversa.telefone);
      return {
        nome: (info?.subject as string) ?? null,
        foto_url: (info?.pictureUrl as string) ?? null,
      };
    }

    const info = await this.evolutionService.getProfilePictureUrl(
      instance,
      conversa.telefone,
    );
    return {
      nome: null,
      foto_url: (info?.profilePictureUrl as string) ?? null,
    };
  }

  // Foto de perfil de quem escreveu uma mensagem dentro de um grupo.
  // Message.remetente_telefone vem do "participant" do webhook da
  // Evolution API — em grupos com "addressingMode: lid" (modo de
  // privacidade mais novo do WhatsApp) isso é um "lid" (id vinculado),
  // não o telefone de verdade, e a Evolution API não acha foto de perfil
  // buscando por um lid. `GET /group/findGroupInfos` devolve os dois por
  // participante (`id` = lid, `phoneNumber` = telefone real) — resolve
  // aqui antes de buscar a foto. Se não achar o participante na lista
  // (grupo sem "lid", ou participante saiu do grupo), tenta o valor
  // recebido direto como fallback.
  async buscarAvatarParticipante(
    id: string,
    instance: string,
    participante: string,
  ): Promise<{ foto_url: string | null }> {
    const conversa = await this.buscarOuFalhar(id);

    let numero = participante;
    if (conversa.tipo === ConversationTipo.GRUPO) {
      const grupoInfo = await this.evolutionService.getGroupInfo(instance, conversa.telefone);
      const participantes =
        (grupoInfo?.participants as Array<Record<string, unknown>>) ?? [];
      const encontrado = participantes.find(
        (p) => (p.id as string | undefined)?.split('@')[0] === participante,
      );
      const telefoneReal = (encontrado?.phoneNumber as string | undefined)?.split('@')[0];
      if (telefoneReal) {
        numero = telefoneReal;
      }
    }

    const info = await this.evolutionService.getProfilePictureUrl(instance, numero);
    return { foto_url: (info?.profilePictureUrl as string) ?? null };
  }

  async assumir(id: string, atendenteId: string): Promise<Conversation> {
    const conversa = await this.buscarOuFalhar(id);
    this.recusarSeGrupo(conversa, 'assumir');

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
    this.recusarSeGrupo(conversa, 'transferir');

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
    this.recusarSeGrupo(conversa, 'finalizar');

    conversa.status = ConversationStatus.FINALIZADO;
    conversa.finalizado_em = new Date();

    const atualizada = await this.conversationsRepository.save(conversa);
    this.eventsGateway.emitConversaFinalizada(atualizada);
    return atualizada;
  }

  async reabrir(id: string): Promise<Conversation> {
    const conversa = await this.buscarOuFalhar(id);
    this.recusarSeGrupo(conversa, 'reabrir');

    if (conversa.status !== ConversationStatus.FINALIZADO) {
      throw new BadRequestException(
        'Só é possível reabrir conversas finalizadas.',
      );
    }

    // Evita duas conversas "ativas" (não-finalizado) pro mesmo telefone ao
    // mesmo tempo — poderia acontecer se o cliente já mandou mensagem depois
    // da finalização (o n8n cria uma conversa nova nesse caso, ver
    // findConversaAtivaPorTelefone) e alguém tenta reabrir a antiga também.
    const jaTemAtiva = await this.conversationsRepository
      .createQueryBuilder('conversation')
      .where('conversation.telefone = :telefone', { telefone: conversa.telefone })
      .andWhere('conversation.id != :id', { id })
      .andWhere('conversation.status != :status', {
        status: ConversationStatus.FINALIZADO,
      })
      .getCount();
    if (jaTemAtiva > 0) {
      throw new BadRequestException(
        'Já existe uma conversa em aberto para esse telefone — não é possível reabrir esta.',
      );
    }

    // Volta pro mesmo atendente que já estava com a conversa (finalizar não
    // limpa atendente_id) — reabrir continua de onde parou, sem precisar
    // "assumir" de novo. Só cai em "aguardando" no caso raro de nunca ter
    // tido atendente (ex: registro antigo/manual sem esse campo setado).
    conversa.status = conversa.atendente_id
      ? ConversationStatus.EM_ATENDIMENTO
      : ConversationStatus.AGUARDANDO;
    conversa.finalizado_em = null;

    const atualizada = await this.conversationsRepository.save(conversa);

    await this.messagesRepository.save(
      this.messagesRepository.create({
        conversation_id: conversa.id,
        origem: MessageOrigin.SISTEMA,
        mensagem: 'Conversa reaberta.',
      }),
    );

    this.eventsGateway.emitConversaAtualizada(atualizada);
    return atualizada;
  }

  // Grupo não tem fila/status (ver "Grupos" no frontend) — assumir,
  // transferir e finalizar são conceitos só de conversa com cliente.
  private recusarSeGrupo(conversa: Conversation, acao: string): void {
    if (conversa.tipo === ConversationTipo.GRUPO) {
      throw new BadRequestException(`Não é possível ${acao} uma conversa de grupo.`);
    }
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
