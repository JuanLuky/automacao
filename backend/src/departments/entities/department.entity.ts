import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('departments')
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  // Código curto usado no mapeamento do menu do WhatsApp (RH, FIN, CONT, TI, COM)
  @Column({ unique: true })
  codigo: string;

  @Column({ default: true })
  ativo: boolean;
}
