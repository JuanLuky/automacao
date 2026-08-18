import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Templates de resposta rápida usados no chat (painel do atendente) — antes
// uma lista fixa em frontend/src/lib/quickReplies.ts, agora editável por
// admin em /mensagens. "categoria" é texto livre (não um enum fixo): quem
// agrupa por categoria na exibição é o frontend, preservando a ordem de
// primeira aparição na lista ordenada por "ordem".
@Entity('quick_replies')
export class QuickReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  categoria: string;

  @Column('text')
  texto: string;

  @Column('int', { default: 0 })
  ordem: number;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
