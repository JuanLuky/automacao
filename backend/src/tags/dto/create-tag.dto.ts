import { IsHexColor, IsNotEmpty, IsString } from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsHexColor()
  cor: string;
}
