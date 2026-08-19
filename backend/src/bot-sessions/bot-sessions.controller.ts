import { Controller, Delete, Get, Param, UseGuards } from '@nestjs/common';
import { BotSessionsService } from './bot-sessions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// Só leitura e descarte pelo painel — quem cria/atualiza é o próprio fluxo
// de mensagem recebida, não uma chamada externa.
@UseGuards(JwtAuthGuard)
@Controller('bot-sessions')
export class BotSessionsController {
  constructor(private readonly botSessionsService: BotSessionsService) {}

  @Get()
  listar() {
    return this.botSessionsService.listar();
  }

  // "Ignorar": tira da lista sem abrir atendimento (ex: número errado,
  // robô de propaganda). Se a pessoa escrever de novo, volta a aparecer.
  @Delete(':telefone')
  descartar(@Param('telefone') telefone: string) {
    return this.botSessionsService.encerrar(telefone);
  }
}
