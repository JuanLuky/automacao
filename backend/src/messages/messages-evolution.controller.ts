import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { EditMessageByEvolutionIdDto } from './dto/edit-message-by-evolution-id.dto';
import { N8nOrJwtAuthGuard } from '../auth/guards/n8n-or-jwt-auth.guard';

// Só o n8n chama essas rotas, a partir dos eventos
// "messages.edited"/"messages.delete" do webhook da Evolution API — quando
// o cliente edita ou apaga a própria mensagem no WhatsApp (ver
// MessagesService.editarPorEvolutionId/apagarPorEvolutionId). Rota separada
// de MessagesController porque nesse ponto do fluxo o n8n só tem o id da
// mensagem no WhatsApp, não conversationId. Protegida por N8nOrJwtAuthGuard
// (header "x-n8n-api-key") — não tem uso pelo painel, mas reaproveita o
// mesmo guard dos outros endpoints do n8n por consistência.
@UseGuards(N8nOrJwtAuthGuard)
@Controller('messages/evolution')
export class MessagesEvolutionController {
  constructor(private readonly messagesService: MessagesService) {}

  @Patch(':evolutionMessageId')
  editar(
    @Param('evolutionMessageId') evolutionMessageId: string,
    @Body() dto: EditMessageByEvolutionIdDto,
  ) {
    return this.messagesService.editarPorEvolutionId(
      evolutionMessageId,
      dto.mensagem,
    );
  }

  @Delete(':evolutionMessageId')
  apagar(@Param('evolutionMessageId') evolutionMessageId: string) {
    return this.messagesService.apagarPorEvolutionId(evolutionMessageId);
  }
}
