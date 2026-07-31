import {
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
  ) {
    return this.conversationsService.findAll({
      status,
      departamento_id,
      busca,
      data_inicio,
      data_fim,
    });
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
