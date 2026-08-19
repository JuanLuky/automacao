import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// Payload de "chamar o cliente sem ele chamar" (POST /conversations/outbound).
// Diferente de CreateConversationDto (usado pelo n8n quando o cliente
// escreve primeiro): aqui o telefone é digitado por gente, então vem cru —
// com máscara, com ou sem DDI — e quem valida/normaliza é o service, contra
// a Evolution API.
export class StartConversationDto {
  @IsString()
  @MinLength(8, { message: 'Telefone muito curto.' })
  telefone: string;

  @IsOptional()
  @IsString()
  cliente_nome?: string;

  @IsUUID()
  departamento_id: string;

  // Instância da Evolution API — necessária já na criação (diferente da
  // rota do n8n) porque o número é conferido no WhatsApp antes de abrir a
  // conversa.
  @IsString()
  instance: string;
}
