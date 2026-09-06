import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';
import { EventsGateway } from '../websocket/events.gateway';
import { MediaStorageService } from '../messages/media-storage.service';
import { MessageTipo } from '../messages/entities/message.entity';

export interface BotSessionMensagem {
  texto: string;
  criado_em: string;
  // 'cliente' = o que a pessoa escreveu; 'bot' = menu (re)enviado pelo n8n
  // enquanto ela não escolhia um setor válido. Opcional só pra registro
  // antigo em memória durante o deploy; toda escrita nova sempre inclui.
  origem?: 'cliente' | 'bot';
  // Presentes só quando a pessoa mandou mídia antes de escolher o setor
  // (ver registrarMidia) — ausentes = mensagem de texto puro.
  tipo?: MessageTipo;
  midia_path?: string;
  midia_mimetype?: string;
  midia_nome_arquivo?: string | null;
}

@Injectable()
export class BotSessionsService {
  constructor(
    @InjectRepository(BotSession)
    private readonly repo: Repository<BotSession>,
    private readonly eventsGateway: EventsGateway,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  // Chamado toda vez que chega mensagem de um telefone sem atendimento
  // aberto (ver ConversationsService.findConversaAtivaPorTelefone) — é o
  // momento exato em que o n8n vai mandar o menu.
  //
  // ON CONFLICT em vez de "busca e decide": o n8n dispara isso por
  // mensagem recebida, e duas mensagens quase simultâneas do mesmo
  // telefone criariam duas linhas numa versão com leitura antes da
  // escrita. "mensagens" usa concatenação de jsonb (||) pelo mesmo
  // motivo — soma ao array existente em vez de reescrevê-lo.
  async registrarTentativa(
    telefone: string,
    texto?: string,
    nome?: string,
  ): Promise<void> {
    // Grupo não entra no menu de setores (ver "Grupos" no CLAUDE.md), então
    // também não vira sessão de bot.
    if (!telefone || telefone.includes('@g.us')) return;

    const nomeLimpo = nome?.trim() || null;

    // Mensagem de mídia chega aqui com texto vazio (o n8n manda a legenda,
    // se houver, separadamente via registrarMidia, que já registra a
    // tentativa junto — ver lá) — só sobe o contador, sem criar entrada
    // duplicada no histórico.
    const textoLimpo = texto?.trim();
    if (!textoLimpo) {
      await this.repo.query(
        `INSERT INTO bot_sessions (telefone, nome) VALUES ($1, $2)
         ON CONFLICT (telefone) DO UPDATE
         SET tentativas = bot_sessions.tentativas + 1,
             atualizado_em = now(),
             nome = COALESCE($2, bot_sessions.nome)`,
        [telefone, nomeLimpo],
      );
      this.eventsGateway.emitBotSessionAtualizada();
      return;
    }

    const novaMensagem = JSON.stringify([
      { texto: textoLimpo, criado_em: new Date().toISOString(), origem: 'cliente' },
    ]);
    await this.repo.query(
      `INSERT INTO bot_sessions (telefone, nome, mensagens) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (telefone) DO UPDATE
       SET tentativas = bot_sessions.tentativas + 1,
           atualizado_em = now(),
           nome = COALESCE($2, bot_sessions.nome),
           mensagens = bot_sessions.mensagens || $3::jsonb`,
      [telefone, nomeLimpo, novaMensagem],
    );
    this.eventsGateway.emitBotSessionAtualizada();
  }

  // Chamado pelo n8n quando a mensagem recebida sem conversa aberta é mídia
  // (imagem, documento, áudio, vídeo) — contraparte de registrarTentativa
  // pro caso que antes era descartado (ver comentário lá e o bug de
  // histórico perdido em PROGRESSO.md). Salva o arquivo em disco já aqui
  // (mesmo MediaStorageService das mensagens normais, com um id provisório
  // — ConversationsService.inserirHistoricoBot é quem cria o registro de
  // Message de verdade depois, reaproveitando esse midia_path) e soma a
  // tentativa no mesmo INSERT/UPDATE de registrarTentativa, pra não contar
  // a mesma mensagem duas vezes nem criar duas entradas separadas no
  // histórico quando a mídia vem com legenda.
  async registrarMidia(
    telefone: string,
    dados: {
      texto?: string;
      nome?: string;
      tipo: MessageTipo;
      midia_base64: string;
      midia_mimetype: string;
      midia_nome_arquivo?: string | null;
    },
  ): Promise<void> {
    // Mesma exclusão de grupo de registrarTentativa (grupo não passa pelo
    // menu de setores).
    if (!telefone || telefone.includes('@g.us')) return;

    const salvo = await this.mediaStorage.salvar(
      randomUUID(),
      dados.tipo,
      dados.midia_base64,
      dados.midia_mimetype,
    );

    const nomeLimpo = dados.nome?.trim() || null;
    const novaMensagem = JSON.stringify([
      {
        texto: dados.texto?.trim() || '',
        criado_em: new Date().toISOString(),
        origem: 'cliente',
        tipo: dados.tipo,
        midia_path: salvo.path,
        midia_mimetype: dados.midia_mimetype,
        midia_nome_arquivo: dados.midia_nome_arquivo ?? null,
      },
    ]);
    await this.repo.query(
      `INSERT INTO bot_sessions (telefone, nome, mensagens) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (telefone) DO UPDATE
       SET tentativas = bot_sessions.tentativas + 1,
           atualizado_em = now(),
           nome = COALESCE($2, bot_sessions.nome),
           mensagens = bot_sessions.mensagens || $3::jsonb`,
      [telefone, nomeLimpo, novaMensagem],
    );
    this.eventsGateway.emitBotSessionAtualizada();
  }

  // Chamado pelo n8n toda vez que reenvia o menu de setores (a pessoa
  // ainda não escolheu um número válido) — guarda o texto do menu junto do
  // histórico, pro atendente ver a conversa inteira (pergunta do bot +
  // resposta da pessoa), não só o que ela escreveu. Não mexe em
  // "tentativas" (isso já sobe em registrarTentativa, no mesmo ciclo) nem
  // em "nome" (o n8n não manda isso aqui). Sempre roda depois de
  // registrarTentativa no mesmo fluxo, então a linha já existe — o INSERT
  // aqui é só defensivo (ex: chamada isolada de teste).
  async registrarMensagemBot(telefone: string, texto: string): Promise<void> {
    const textoLimpo = texto?.trim();
    if (!telefone || !textoLimpo) return;

    const novaMensagem = JSON.stringify([
      { texto: textoLimpo, criado_em: new Date().toISOString(), origem: 'bot' },
    ]);
    await this.repo.query(
      `INSERT INTO bot_sessions (telefone, mensagens) VALUES ($1, $2::jsonb)
       ON CONFLICT (telefone) DO UPDATE
       SET atualizado_em = now(),
           mensagens = bot_sessions.mensagens || $2::jsonb`,
      [telefone, novaMensagem],
    );
    this.eventsGateway.emitBotSessionAtualizada();
  }

  listar(): Promise<BotSession[]> {
    return this.repo.find({ order: { atualizado_em: 'DESC' } });
  }

  // Chamado quando a conversa nasce — pela escolha do setor (n8n) ou por
  // um atendente puxando a pessoa. A partir daí ela está na fila, não no
  // bot, e não pode aparecer nos dois lugares.
  async encerrar(telefone: string): Promise<void> {
    if (!telefone) return;
    const resultado = await this.repo.delete({ telefone });
    if (resultado.affected) {
      this.eventsGateway.emitBotSessionAtualizada();
    }
  }

  // Mesmo gatilho de "encerrar" (a conversa está nascendo), mas devolvendo
  // o que a pessoa escreveu antes de sumir — ConversationsService usa isso
  // pra colocar esse histórico dentro da própria Conversation recém-criada,
  // em vez de só descartar (ver create/iniciar). DELETE...RETURNING garante
  // ler e apagar como uma operação só.
  async consumirHistorico(telefone: string): Promise<BotSessionMensagem[]> {
    if (!telefone) return [];
    // O driver do Postgres devolve DELETE...RETURNING como uma tupla
    // [linhas, quantidadeAfetada] via query() (diferente de INSERT/UPDATE
    // ...RETURNING, que devolve as linhas direto) — sem desestruturar aqui,
    // "linhas[0]" era o array inteiro, não a primeira linha, e
    // "linhas[0].mensagens" saía sempre undefined. Foi por isso que o
    // histórico nunca chegava na conversa recém-criada (bug real,
    // encontrado em 2026-08-21 comparando o resultado via TypeORM puro
    // contra psql direto — psql sempre devolveu certo).
    const [linhas]: [Array<{ mensagens: BotSessionMensagem[] }>, number] =
      await this.repo.query(
        `DELETE FROM bot_sessions WHERE telefone = $1 RETURNING mensagens`,
        [telefone],
      );
    const mensagens = linhas[0]?.mensagens ?? [];
    if (linhas.length > 0) this.eventsGateway.emitBotSessionAtualizada();
    return mensagens;
  }
}
