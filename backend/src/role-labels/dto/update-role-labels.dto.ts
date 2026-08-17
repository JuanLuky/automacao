import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateRoleLabelsDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  atendente?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  supervisor?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  admin?: string;
}
