import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateQuickReplyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoria?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  texto?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordem?: number;
}
