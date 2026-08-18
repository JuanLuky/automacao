import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateClientTagDto {
  @IsString()
  @IsNotEmpty()
  telefone: string;

  @IsUUID()
  tag_id: string;
}
