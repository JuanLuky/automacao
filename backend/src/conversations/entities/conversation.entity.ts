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
import { ConversationTipo } from '../enums/conversation-tipo.enum';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Telefone no formato retornado pela Evolution API (só dígitos, sem
  // @s.whatsapp.net) quando tipo = cliente. Quando tipo = grupo, guarda o
  // JID completo do grupo (com @g.us) — é o que a Evolution API exige no
  // campo "number" pra responder num grupo, não existe "número" de grupo.
  @Column()
  telefone: string;

  // Nome do cliente (tipo = cliente) — não usado/preenchido para grupos
  // (o nome do grupo não é buscado automaticamente, ver n8n "Extrair Dados
  // da Mensagem"; aparece como "Grupo sem nome" no frontend).
  @Column({ nullable: true })
  cliente_nome: string;

  @Column({
    type: 'enum',
    enum: ConversationTipo,
    default: ConversationTipo.CLIENTE,
  })
  tipo: ConversationTipo;

  // Obrigatório para tipo = cliente (fila por setor); sempre null para
  // tipo = grupo — grupo não pertence a um setor, todos os atendentes têm
  // acesso (ver "Grupos" no frontend).
  @Column({ type: 'uuid', nullable: true })
  departamento_id: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'departamento_id' })
  departamento: Department | null;

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
