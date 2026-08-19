import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotSession } from './entities/bot-session.entity';

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
  // escrita.
  async registrarTentativa(telefone: string): Promise<void> {
    // Grupo não entra no menu de setores (ver "Grupos" no CLAUDE.md), então
    // também não vira sessão de bot.
    if (!telefone || telefone.includes('@g.us')) return;

    await this.repo.query(
      `INSERT INTO bot_sessions (telefone) VALUES ($1)
       ON CONFLICT (telefone) DO UPDATE
       SET tentativas = bot_sessions.tentativas + 1, atualizado_em = now()`,
      [telefone],
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
}
