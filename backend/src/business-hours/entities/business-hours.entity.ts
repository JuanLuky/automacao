import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Configuração global da empresa (não por setor) — linha única (singleton).
@Entity('business_hours')
export class BusinessHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // getDay(): 0=domingo .. 6=sábado.
  @Column('int', { array: true })
  dias_funcionamento: number[];

  // Formato 'HH:mm'.
  @Column()
  hora_inicio: string;

  @Column()
  hora_fim: string;

  @Column('text')
  mensagem_fora_horario: string;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizado_em: Date;
}
