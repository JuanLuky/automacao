import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  telefone: string;

  @IsOptional()
  @IsString()
  cliente_nome?: string;

  @IsUUID()
  departamento_id: string;

  // Se vier junto com a primeira mensagem do cliente (ex: "4"), já registra no histórico
  @IsOptional()
  @IsString()
  mensagem_inicial?: string;
}
