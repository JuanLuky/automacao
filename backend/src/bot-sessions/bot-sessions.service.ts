import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';

export interface BotSessionMensagem {
  texto: string;
  criado_em: string;
}

@Injectable()
export class BotSessionsService {
  constructor(
    @InjectRepository(BotSession)
    private readonly repo: Repository<BotSession>,
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
  async registrarTentativa(telefone: string, texto?: string): Promise<void> {
    // Grupo não entra no menu de setores (ver "Grupos" no CLAUDE.md), então
    // também não vira sessão de bot.
    if (!telefone || telefone.includes('@g.us')) return;

    // Mensagem de mídia nessa fase (áudio, imagem sem legenda) chega com
    // texto vazio — não vira entrada no histórico (só o contador de
    // tentativas sobe), mesmo escopo já aceito no restante do projeto pra
    // mídia antes da escolha de setor.
    const textoLimpo = texto?.trim();
    if (!textoLimpo) {
      await this.repo.query(
        `INSERT INTO bot_sessions (telefone) VALUES ($1)
         ON CONFLICT (telefone) DO UPDATE
         SET tentativas = bot_sessions.tentativas + 1, atualizado_em = now()`,
        [telefone],
      );
      return;
    }

    const novaMensagem = JSON.stringify([
      { texto: textoLimpo, criado_em: new Date().toISOString() },
    ]);
    await this.repo.query(
      `INSERT INTO bot_sessions (telefone, mensagens) VALUES ($1, $2::jsonb)
       ON CONFLICT (telefone) DO UPDATE
       SET tentativas = bot_sessions.tentativas + 1,
           atualizado_em = now(),
           mensagens = bot_sessions.mensagens || $2::jsonb`,
      [telefone, novaMensagem],
    );
  }

  listar(): Promise<BotSession[]> {
    return this.repo.find({ order: { atualizado_em: 'DESC' } });
  }

  // Chamado quando a conversa nasce — pela escolha do setor (n8n) ou por
  // um atendente puxando a pessoa. A partir daí ela está na fila, não no
  // bot, e não pode aparecer nos dois lugares.
  async encerrar(telefone: string): Promise<void> {
    if (!telefone) return;
    await this.repo.delete({ telefone });
  }

  // Mesmo gatilho de "encerrar" (a conversa está nascendo), mas devolvendo
  // o que a pessoa escreveu antes de sumir — ConversationsService usa isso
  // pra colocar esse histórico dentro da própria Conversation recém-criada,
  // em vez de só descartar (ver create/iniciar). DELETE...RETURNING garante
  // ler e apagar como uma operação só.
  async consumirHistorico(telefone: string): Promise<BotSessionMensagem[]> {
    if (!telefone) return [];
    const linhas: Array<{ mensagens: BotSessionMensagem[] }> = await this.repo.query(
      `DELETE FROM bot_sessions WHERE telefone = $1 RETURNING mensagens`,
      [telefone],
    );
    return linhas[0]?.mensagens ?? [];
  }
}
