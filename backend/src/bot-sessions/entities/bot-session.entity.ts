import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Pessoa que mandou mensagem, recebeu o menu de setores e ainda NÃO
// escolheu nenhum. Antes disso ela não existia em lugar nenhum do sistema
// (Conversation só nasce depois da escolha), então ninguém no escritório
// via que tinha alguém do outro lado tentando falar.
//
// Uma linha por telefone. Some assim que a conversa é criada — seja porque
// a pessoa digitou o número, seja porque um atendente puxou ela pra si.
@Entity('bot_sessions')
export class BotSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  telefone: string;

  // Quantas mensagens a pessoa mandou sem acertar um número de setor. 1 é
  // o normal (acabou de chegar); 4 é gente travada, que provavelmente
  // precisa de alguém humano.
  @Column('int', { default: 1 })
  tentativas: number;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizado_em: Date;
}
