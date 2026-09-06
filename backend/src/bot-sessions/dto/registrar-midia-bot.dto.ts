import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MessageTipo } from '../../messages/entities/message.entity';

export class RegistrarMidiaBotDto {
  @IsOptional()
  @IsString()
  texto?: string;

  @IsOptional()
  @IsString()
  nome?: string;

  @IsEnum(MessageTipo)
  tipo: MessageTipo;

  @IsString()
  midia_base64: string;

  @IsString()
  midia_mimetype: string;

  @IsOptional()
  @IsString()
  midia_nome_arquivo?: string;
}
