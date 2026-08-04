import { IsArray, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateBusinessHoursDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  dias_funcionamento?: number[];

  @IsOptional()
  @IsString()
  @Matches(HORA_REGEX, { message: 'hora_inicio deve estar no formato HH:mm' })
  hora_inicio?: string;

  @IsOptional()
  @IsString()
  @Matches(HORA_REGEX, { message: 'hora_fim deve estar no formato HH:mm' })
  hora_fim?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  mensagem_fora_horario?: string;
}
