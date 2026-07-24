import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Department } from '../../departments/entities/department.entity';
import { User } from '../../users/entities/user.entity';
import { ConversationStatus } from '../enums/conversation-status.enum';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Telefone no formato retornado pela Evolution API (só dígitos, sem @s.whatsapp.net)
  @Column()
  telefone: string;

  @Column({ nullable: true })
  cliente_nome: string;

  @Column({ type: 'uuid' })
  departamento_id: string;

  @ManyToOne(() => Department)
  @JoinColumn({ name: 'departamento_id' })
  departamento: Department;

  @Column({ type: 'uuid', nullable: true })
  atendente_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'atendente_id' })
  atendente: User;

  @Column({
    type: 'enum',
    enum: ConversationStatus,
    default: ConversationStatus.AGUARDANDO,
  })
  status: ConversationStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;

  @Column({ type: 'timestamptz', nullable: true })
  finalizado_em: Date | null;
}
