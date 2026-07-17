import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsString()
  nome: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  senha: string;

  @IsOptional()
  @IsUUID()
  departamento_id?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
