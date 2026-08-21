import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BotSessionsService } from './bot-sessions.service';
import { RegistrarMensagemBotDto } from './dto/registrar-mensagem-bot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Leitura e descarte são só do painel (autenticado); "mensagem-enviada" é
// pública de propósito — quem chama é o n8n, sem token, mesmo padrão de
// ConversationsController.findByPhone (ver lá o porquê).
@Controller('bot-sessions')
export class BotSessionsController {
  constructor(private readonly botSessionsService: BotSessionsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  listar() {
    return this.botSessionsService.listar();
  }

  // "Ignorar": tira da lista sem abrir atendimento (ex: número errado,
  // robô de propaganda). Se a pessoa escrever de novo, volta a aparecer.
  @UseGuards(JwtAuthGuard)
  @Delete(':telefone')
  descartar(@Param('telefone') telefone: string) {
    return this.botSessionsService.encerrar(telefone);
  }

  // Chamado pelo n8n toda vez que reenvia o menu de setores — guarda o
  // texto junto do histórico da sessão (ver BotSessionsService.
  // registrarMensagemBot) pro atendente ver a pergunta do bot, não só a
  // resposta da pessoa.
  @Post(':telefone/mensagem-enviada')
  registrarMensagemEnviada(
    @Param('telefone') telefone: string,
    @Body() dto: RegistrarMensagemBotDto,
  ) {
    return this.botSessionsService.registrarMensagemBot(telefone, dto.texto);
  }
}
