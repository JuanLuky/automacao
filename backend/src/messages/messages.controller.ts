import {
  Controller,
  Delete,
  Get,
  Body,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { DeleteMessageDto } from './dto/delete-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('conversations/:conversationId/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(@Param('conversationId') conversationId: string) {
    return this.messagesService.findByConversation(conversationId);
  }

  // Só o painel autenticado busca mídia de volta — o n8n só empurra mídia
  // pra dentro (POST abaixo), nunca precisa reler o arquivo.
  @UseGuards(JwtAuthGuard)
  @Get(':id/media')
  async media(
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const { buffer, mimetype } = await this.messagesService.getMedia(
      conversationId,
      id,
    );
    res.set('Content-Type', mimetype);
    res.send(buffer);
  }

  // Sem guard: essa rota também é chamada pelo n8n quando o cliente manda
  // uma mensagem para uma conversa já existente (origem: cliente).
  // O painel usa a mesma rota (origem: atendente) autenticado via token,
  // mas como a validação de origem já limita o que pode ser feito,
  // manter aberta simplifica a chamada vinda do n8n.
  @Post()
  create(
    @Param('conversationId') conversationId: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(conversationId, dto);
  }

  // Só o próprio painel autenticado edita/apaga — e o service ainda checa
  // que req.user.id é quem mandou a mensagem (ver MessagesService.editar).
  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  editar(
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
    @Body() dto: EditMessageDto,
    @Req() req: any,
  ) {
    return this.messagesService.editar(
      conversationId,
      id,
      req.user.id,
      dto.mensagem,
      dto.instance,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  apagar(
    @Param('conversationId') conversationId: string,
    @Param('id') id: string,
    @Body() dto: DeleteMessageDto,
    @Req() req: any,
  ) {
    return this.messagesService.apagar(
      conversationId,
      id,
      req.user.id,
      dto.instance,
    );
  }
}
