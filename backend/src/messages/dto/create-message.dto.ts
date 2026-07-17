import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MessageOrigin } from '../entities/message.entity';

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
}
