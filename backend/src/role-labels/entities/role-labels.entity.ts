import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Configuração global (não por setor) — linha única (singleton), mesmo
// padrão de BusinessHours. UserRole (admin/atendente/supervisor) é um enum
// fixo no código — o que é editável aqui é só o texto mostrado pra cada um
// no painel (ex: "Atendente" → "N1"), não o papel em si.
@Entity('role_labels')
export class RoleLabels {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  atendente: string;

  @Column('text')
  supervisor: string;

  @Column('text')
  admin: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizado_em: Date;
}
