import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Catálogo de etiquetas (ex: "Devedor", "Cliente Premium") — editável em
// /etiquetas (só admin). "cor" é um hex (#rrggbb, validado por @IsHexColor
// no DTO), usado como base pro pill colorido no frontend.
@Entity('tags')
export class Tag {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  nome: string;

  @Column('text')
  cor: string;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
