import { IsString, MinLength } from 'class-validator';

export class CreateDepartmentDto {
  @IsString()
  @MinLength(2)
  nome: string;

  // Código curto usado no mapeamento do menu do WhatsApp (ver n8n).
  // Não existe validação de formato aqui de propósito: quem decide o
  // vocabulário de código é o fluxo do n8n, não o backend.
  @IsString()
  @MinLength(2)
  codigo: string;
}
