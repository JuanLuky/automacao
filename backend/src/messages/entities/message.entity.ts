import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Conversation } from '../../conversations/entities/conversation.entity';

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

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
