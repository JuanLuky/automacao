import { IsNotEmpty, IsString } from 'class-validator';

export class DeleteMessageDto {
  // Instância da Evolution API pra apagar de verdade no WhatsApp — mesmo
  // padrão de CreateMessageDto.instance (o frontend manda EVOLUTION_INSTANCE).
  @IsString()
  @IsNotEmpty()
  instance: string;
}
