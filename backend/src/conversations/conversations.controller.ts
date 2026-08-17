import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { TransferConversationDto } from './dto/transfer-conversation.dto';
import { ConversationStatus } from './enums/conversation-status.enum';
import { ConversationTipo } from './enums/conversation-tipo.enum';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  // Rota usada pelo painel (autenticada)
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @Query('status') status?: ConversationStatus,
    @Query('departamento_id') departamento_id?: string,
    @Query('busca') busca?: string,
    @Query('data_inicio') data_inicio?: string,
    @Query('data_fim') data_fim?: string,
    @Query('pagina') pagina?: string,
    @Query('por_pagina') por_pagina?: string,
    @Query('tipo') tipo?: ConversationTipo,
  ) {
    return this.conversationsService.findAll({
      status,
      departamento_id,
      busca,
      data_inicio,
      data_fim,
      pagina: pagina ? parseInt(pagina, 10) : undefined,
      por_pagina: por_pagina ? parseInt(por_pagina, 10) : undefined,
      tipo,
    });
  }

  // Busca uma única conversa por id — usada pela tela de chat (cliente ou
  // grupo). Ver ConversationsService.buscarPorId.
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  buscarPorId(@Param('id') id: string) {
    return this.conversationsService.buscarPorId(id);
  }

  // Nome/foto ao vivo do WhatsApp (grupo) ou só foto (cliente, o nome já
  // vem salvo na conversa) — usado pelos avatares na fila/grupos/chat. Ver
  // ConversationsService.buscarInfoWhatsapp.
  @UseGuards(JwtAuthGuard)
  @Get(':id/whatsapp-info')
  buscarInfoWhatsapp(@Param('id') id: string, @Query('instance') instance: string) {
    if (!instance) {
      throw new BadRequestException('Campo "instance" é obrigatório.');
    }
    return this.conversationsService.buscarInfoWhatsapp(id, instance);
  }

  // Foto de quem escreveu uma mensagem dentro do grupo — resolve "lid" pra
  // telefone real via a lista de participantes do grupo antes de buscar a
  // foto (ver ConversationsService.buscarAvatarParticipante).
  @UseGuards(JwtAuthGuard)
  @Get(':id/participant-avatar')
  buscarAvatarParticipante(
    @Param('id') id: string,
    @Query('instance') instance: string,
    @Query('participante') participante: string,
  ) {
    if (!instance || !participante) {
      throw new BadRequestException('Campos "instance" e "participante" são obrigatórios.');
    }
    return this.conversationsService.buscarAvatarParticipante(id, instance, participante);
  }

  // Rota usada pelo n8n para checar se já existe conversa em aberto.
  // Sem autenticação de atendente de propósito — quem protege esse endpoint
  // é a rede interna do Docker (n8n só é alcançável de dentro da rede).
  @Get('by-phone/:telefone')
  findByPhone(@Param('telefone') telefone: string) {
    return this.conversationsService.findConversaAtivaPorTelefone(telefone);
  }

  // Rota usada pelo n8n para criar o atendimento quando o cliente escolhe o setor.
  @Post()
  create(@Body() dto: CreateConversationDto) {
    return this.conversationsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/assume')
  assumir(@Param('id') id: string, @Req() req: any) {
    return this.conversationsService.assumir(id, req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/transfer')
  transferir(@Param('id') id: string, @Body() dto: TransferConversationDto) {
    return this.conversationsService.transferir(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/finish')
  finalizar(@Param('id') id: string) {
    return this.conversationsService.finalizar(id);
  }
}
