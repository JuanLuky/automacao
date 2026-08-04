import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum StatusEstado {
  OPERACIONAL = 'operacional',
  INSTABILIDADE = 'instabilidade',
  INDISPONIVEL = 'indisponivel',
}

@Entity('status_updates')
export class StatusUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: StatusEstado })
  estado: StatusEstado;

  @Column('text')
  mensagem: string;

  // timestamptz, não timestamp — ver "Colunas de data/hora" no CLAUDE.md.
  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
