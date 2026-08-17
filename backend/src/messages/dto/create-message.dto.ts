import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageOrigin, MessageTipo } from '../entities/message.entity';

export class CreateMessageDto {
  @IsEnum(MessageOrigin)
  origem: MessageOrigin;

  @IsString()
  mensagem: string;

  // Obrigatório apenas quando origem = atendente, para saber em qual
  // instância da Evolution API disparar a resposta ao cliente.
  @IsOptional()
  @IsString()
  instance?: string;

  // Só usado quando origem = atendente E a conversa é de grupo (ver
  // MessagesService.create): grupo não tem "atendente da conversa" (não
  // existe assumir), então quem está respondendo precisa vir explícito no
  // payload — o painel manda o id do usuário logado. Ignorado para
  // conversa de cliente, que continua derivando de conversa.atendente_id.
  @IsOptional()
  @IsUUID()
  atendente_id?: string;

  // Ausente/'texto' = mensagem de texto comum (comportamento de sempre).
  // Os três campos de mídia abaixo só fazem sentido quando tipo != 'texto'
  // (ver MessagesService.create e MediaStorageService).
  @IsOptional()
  @IsEnum(MessageTipo)
  tipo?: MessageTipo;

  @IsOptional()
  @IsString()
  midia_base64?: string;

  @IsOptional()
  @IsString()
  midia_mimetype?: string;

  @IsOptional()
  @IsString()
  midia_nome_arquivo?: string;

  // Mensagem enviada direto do celular conectado ao WhatsApp, fora do
  // painel (ex: atendente respondeu pelo próprio aparelho) — o n8n manda
  // isso true quando detecta um evento "fromMe" no webhook da Evolution
  // API. Faz o backend só registrar a mensagem (pro histórico aparecer no
  // painel), sem reenviar ao WhatsApp nem exigir instance/atendente_id —
  // ela já foi entregue por fora. Ver MessagesService.create.
  @IsOptional()
  @IsBoolean()
  origem_externa?: boolean;

  // Id da mensagem no WhatsApp (data.key.id do webhook) — usado pro
  // backend não duplicar quando o mesmo evento "fromMe" é o eco de uma
  // mensagem que o próprio painel acabou de mandar (ver
  // MessagesService.create, dedup por evolution_message_id).
  @IsOptional()
  @IsString()
  evolution_message_id?: string;

  // Só fazem sentido quando origem = cliente E a conversa é um grupo
  // (várias pessoas escrevem na mesma conversa) — quem realmente mandou a
  // mensagem dentro do grupo. Ignorados em conversa 1:1. Ver
  // "Grupos do WhatsApp" no CLAUDE.md.
  @IsOptional()
  @IsString()
  remetente_nome?: string;

  @IsOptional()
  @IsString()
  remetente_telefone?: string;
}
