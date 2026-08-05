import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MessageOrigin, MessageTipo } from '../entities/message.entity';

export class CreateMessageDto {
  @IsEnum(MessageOrigin)
  origem: MessageOrigin;

  @IsString()
  mensagem: string;

  // Obrigatório apenas quando origem = atendente, para saber em qual
  // instância da Evolution API disparar a resposta ao cliente.
  @IsOptional()
  @IsString()
  instance?: string;

  // Ausente/'texto' = mensagem de texto comum (comportamento de sempre).
  // Os três campos de mídia abaixo só fazem sentido quando tipo != 'texto'
  // (ver MessagesService.create e MediaStorageService).
  @IsOptional()
  @IsEnum(MessageTipo)
  tipo?: MessageTipo;

  @IsOptional()
  @IsString()
  midia_base64?: string;

  @IsOptional()
  @IsString()
  midia_mimetype?: string;

  @IsOptional()
  @IsString()
  midia_nome_arquivo?: string;
}
