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
