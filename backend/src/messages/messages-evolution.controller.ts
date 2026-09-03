import { Body, Controller, Delete, Param, Patch } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { EditMessageByEvolutionIdDto } from './dto/edit-message-by-evolution-id.dto';

// Sem guard: só o n8n chama essas rotas, a partir dos eventos
// "messages.edited"/"messages.delete" do webhook da Evolution API — quando
// o cliente edita ou apaga a própria mensagem no WhatsApp (ver
// MessagesService.editarPorEvolutionId/apagarPorEvolutionId). Rota separada
// de MessagesController porque nesse ponto do fluxo o n8n só tem o id da
// mensagem no WhatsApp, não conversationId.
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
