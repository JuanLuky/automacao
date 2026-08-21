import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';
import { EventsGateway } from '../websocket/events.gateway';

export interface BotSessionMensagem {
  texto: string;
  criado_em: string;
  // 'cliente' = o que a pessoa escreveu; 'bot' = menu (re)enviado pelo n8n
  // enquanto ela não escolhia um setor válido. Opcional só pra registro
  // antigo em memória durante o deploy; toda escrita nova sempre inclui.
  origem?: 'cliente' | 'bot';
}

@Injectable()
export class BotSessionsService {
  constructor(
    @InjectRepository(BotSession)
    private readonly repo: Repository<BotSession>,
    private readonly eventsGateway: EventsGateway,
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

    // Mensagem de mídia nessa fase (áudio, imagem sem legenda) chega com
    // texto vazio — não vira entrada no histórico (só o contador de
    // tentativas sobe), mesmo escopo já aceito no restante do projeto pra
    // mídia antes da escolha de setor.
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
