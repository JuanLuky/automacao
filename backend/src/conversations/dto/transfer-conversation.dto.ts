import { IsOptional, IsString, IsUUID } from 'class-validator';

export class TransferConversationDto {
  @IsUUID()
  departamento_destino_id: string;

  @IsOptional()
  @IsString()
  motivo?: string;
}
