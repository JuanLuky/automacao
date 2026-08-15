import { IsEnum, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';
import { ConversationTipo } from '../enums/conversation-tipo.enum';

export class CreateConversationDto {
  @IsString()
  telefone: string;

  @IsOptional()
  @IsString()
  cliente_nome?: string;

  @IsOptional()
  @IsEnum(ConversationTipo)
  tipo?: ConversationTipo;

  // Obrigatório só quando tipo = cliente (padrão) — grupo não tem setor
  // (ver Conversation.departamento_id).
  @ValidateIf((dto) => (dto.tipo ?? ConversationTipo.CLIENTE) === ConversationTipo.CLIENTE)
  @IsUUID()
  departamento_id?: string;

  // Se vier junto com a primeira mensagem do cliente (ex: "4"), já registra no histórico
  @IsOptional()
  @IsString()
  mensagem_inicial?: string;
}
