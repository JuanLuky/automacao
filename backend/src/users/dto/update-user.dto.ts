import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @MinLength(6)
  senha?: string;

  @IsOptional()
  @IsUUID()
  departamento_id?: string | null;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
