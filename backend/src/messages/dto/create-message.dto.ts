import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
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

  // Só usado quando origem = atendente E a conversa é de grupo (ver
  // MessagesService.create): grupo não tem "atendente da conversa" (não
  // existe assumir), então quem está respondendo precisa vir explícito no
  // payload — o painel manda o id do usuário logado. Ignorado para
  // conversa de cliente, que continua derivando de conversa.atendente_id.
  @IsOptional()
  @IsUUID()
  atendente_id?: string;

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
