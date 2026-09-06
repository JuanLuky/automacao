import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { BotSessionsService } from './bot-sessions.service';
import { RegistrarMensagemBotDto } from './dto/registrar-mensagem-bot.dto';
import { RegistrarMidiaBotDto } from './dto/registrar-midia-bot.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { N8nOrJwtAuthGuard } from '../auth/guards/n8n-or-jwt-auth.guard';

// Leitura e descarte são só do painel (autenticado); "mensagem-enviada" é
// chamada pelo n8n sem token de atendente, protegida por N8nOrJwtAuthGuard
// (header "x-n8n-api-key") — mesmo padrão de ConversationsController.findByPhone.
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
  @UseGuards(N8nOrJwtAuthGuard)
  @Post(':telefone/mensagem-enviada')
  registrarMensagemEnviada(
    @Param('telefone') telefone: string,
    @Body() dto: RegistrarMensagemBotDto,
  ) {
    return this.botSessionsService.registrarMensagemBot(telefone, dto.texto);
  }

  // Chamado pelo n8n quando a mensagem recebida sem conversa aberta é mídia
  // (imagem/documento/áudio/vídeo) — mesmo padrão de autenticação das
  // demais rotas chamadas pelo n8n (ver BotSessionsService.registrarMidia).
  @UseGuards(N8nOrJwtAuthGuard)
  @Post(':telefone/midia-recebida')
  registrarMidiaRecebida(
    @Param('telefone') telefone: string,
    @Body() dto: RegistrarMidiaBotDto,
  ) {
    return this.botSessionsService.registrarMidia(telefone, dto);
  }
}
