import { IsNotEmpty, IsString } from 'class-validator';

// Corpo de PATCH /messages/evolution/:evolutionMessageId — sem "instance"
// (diferente de EditMessageDto): essa rota só registra no histórico uma
// edição que já aconteceu de verdade no WhatsApp (cliente editou a própria
// mensagem), não manda nada de volta pra Evolution API.
export class EditMessageByEvolutionIdDto {
  @IsString()
  @IsNotEmpty()
  mensagem: string;
}
