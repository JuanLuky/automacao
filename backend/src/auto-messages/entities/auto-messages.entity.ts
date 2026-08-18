import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Configuração global (não por setor/usuário) — linha única (singleton),
// mesmo padrão de BusinessHours/RoleLabels. Textos disparados
// automaticamente ao Assumir/Finalizar uma conversa (ver MessagesService via
// fila/page.tsx e conversas/[id]/page.tsx no frontend).
@Entity('auto_messages')
export class AutoMessages {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  mensagem_iniciar: string;

  @Column('text')
  mensagem_finalizar: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizado_em: Date;
}
