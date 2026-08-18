import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateQuickReplyDto {
  @IsString()
  @IsNotEmpty()
  categoria: string;

  @IsString()
  @IsNotEmpty()
  texto: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;
}
