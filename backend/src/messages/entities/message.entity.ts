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
  // assumida no momento do envio (ver MessagesService.create).
  @Column({ type: 'uuid', nullable: true })
  atendente_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'atendente_id' })
  atendente: User;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
