import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Tag } from './tag.entity';

// Vincula uma etiqueta a um TELEFONE (cliente), não a uma Conversation
// específica — uma característica do cliente (ex: "Devedor") precisa
// sobreviver entre atendimentos, e cada atendimento novo vira uma
// Conversation nova depois que a anterior é finalizada (ver
// ConversationsService.findConversaAtivaPorTelefone). Sem FK pra
// conversations/contacts de propósito — funciona mesmo pra um telefone que
// nunca foi salvo em /contatos.
@Entity('client_tags')
export class ClientTag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  telefone: string;

  @ManyToOne(() => Tag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
