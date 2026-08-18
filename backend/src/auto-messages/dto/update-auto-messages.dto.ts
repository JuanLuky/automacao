import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAutoMessagesDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mensagem_iniciar?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  mensagem_finalizar?: string;
}
