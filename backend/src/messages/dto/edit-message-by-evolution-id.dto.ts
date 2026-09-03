import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Corpo de PATCH /messages/evolution/:evolutionMessageId — sem "instance"
// (diferente de EditMessageDto): essa rota só registra no histórico uma
// edição que já aconteceu de verdade no WhatsApp (cliente editou a própria
// mensagem), não manda nada de volta pra Evolution API.
//
// "mensagem" ausente = edição via secretEncryptedMessage (chat @lid, ver
// MessagesService.editarPorEvolutionId): o n8n sabe QUAL mensagem foi
// editada (targetMessageKey.id), mas não o texto novo, porque o Baileys
// usado pela Evolution API não decodifica esse campo do WhatsApp ainda.
export class EditMessageByEvolutionIdDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mensagem?: string;
}
