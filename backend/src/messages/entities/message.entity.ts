import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';
import { User } from '../../users/entities/user.entity';

export enum MessageOrigin {
  CLIENTE = 'cliente',
  ATENDENTE = 'atendente',
  SISTEMA = 'sistema',
}

export enum MessageTipo {
  TEXTO = 'texto',
  IMAGEM = 'imagem',
  AUDIO = 'audio',
  DOCUMENTO = 'documento',
  VIDEO = 'video',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversation_id: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ type: 'enum', enum: MessageOrigin })
  origem: MessageOrigin;

  @Column({ type: 'text' })
  mensagem: string;

  @Column({ type: 'enum', enum: MessageTipo, default: MessageTipo.TEXTO })
  tipo: MessageTipo;

  // Caminho relativo dentro do diretório de storage de mídia (ver
  // MediaStorageService) — nunca o nome de arquivo enviado pelo cliente.
  @Column({ type: 'text', nullable: true })
  midia_path: string | null;

  @Column({ type: 'text', nullable: true })
  midia_mimetype: string | null;

  // Nome de exibição (documentos) — só para UI, não usado para montar path em disco.
  @Column({ type: 'text', nullable: true })
  midia_nome_arquivo: string | null;

  // Preenchido só quando origem = atendente: quem estava com a conversa
  // assumida no momento do envio (ver MessagesService.create). Fica null
  // tanto pra grupo sem atendente_id explícito quanto pra mensagem
  // origem_externa (enviada direto do celular conectado, fora do painel).
  @Column({ type: 'uuid', nullable: true })
  atendente_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'atendente_id' })
  atendente: User;

  // Id da mensagem no WhatsApp (Evolution API). Preenchido em dois casos:
  // (1) mensagem enviada pelo painel — guardado depois do envio, a partir
  // do retorno da Evolution API, só pra reconhecer o eco dela quando volta
  // pelo webhook como fromMe e não duplicar no histórico; (2) mensagem
  // enviada direto do celular conectado (origem_externa) — vem do n8n a
  // partir do key.id do próprio webhook. Nunca exposto pro frontend (ver
  // MessagesService.create), é só controle interno de dedup.
  @Column({ type: 'text', nullable: true })
  evolution_message_id: string | null;

  // Preenchidos só quando origem = cliente E a conversa é um grupo do
  // WhatsApp (ver "Grupos do WhatsApp" no CLAUDE.md) — várias pessoas
  // escrevem na mesma conversa, então o remetente de cada mensagem precisa
  // vir junto (não dá pra assumir "o cliente da conversa", como em 1:1).
  // Vêm do n8n a partir de data.key.participant/pushName do webhook da
  // Evolution API. Sempre null numa conversa 1:1.
  @Column({ type: 'text', nullable: true })
  remetente_nome: string | null;

  @Column({ type: 'text', nullable: true })
  remetente_telefone: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
