import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';

class ContatoImportadoDto {
  @IsString()
  @IsNotEmpty()
  nome: string;

  @IsString()
  @IsNotEmpty()
  telefone: string;
}

export class ImportContactsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContatoImportadoDto)
  contatos: ContatoImportadoDto[];
}
