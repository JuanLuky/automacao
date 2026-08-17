import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nome?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  telefone?: string;
}
