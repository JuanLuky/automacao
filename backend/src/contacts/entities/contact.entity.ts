import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  nome: string;

  // Único — evita cadastrar o mesmo número duas vezes na lista gerenciada
  // pelo Maré. Sem relação com os contatos sincronizados do WhatsApp
  // (esses não são persistidos aqui, ver EvolutionService.getContacts).
  @Column({ type: 'text', unique: true })
  telefone: string;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
