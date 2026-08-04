import { IsEnum, IsString, MinLength } from 'class-validator';
import { StatusEstado } from '../entities/status-update.entity';

export class CreateStatusUpdateDto {
  @IsEnum(StatusEstado)
  estado: StatusEstado;

  @IsString()
  @MinLength(3)
  mensagem: string;
}
