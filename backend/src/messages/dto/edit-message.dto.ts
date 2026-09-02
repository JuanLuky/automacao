import { IsNotEmpty, IsString } from 'class-validator';

export class EditMessageDto {
  @IsString()
  @IsNotEmpty()
  mensagem: string;

  // Instância da Evolution API pra editar de verdade no WhatsApp — mesmo
  // padrão de CreateMessageDto.instance (o frontend manda EVOLUTION_INSTANCE).
  @IsString()
  @IsNotEmpty()
  instance: string;
}
