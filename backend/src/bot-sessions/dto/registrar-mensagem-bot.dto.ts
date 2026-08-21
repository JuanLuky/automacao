import { IsString } from 'class-validator';

export class RegistrarMensagemBotDto {
  @IsString()
  texto: string;
}
