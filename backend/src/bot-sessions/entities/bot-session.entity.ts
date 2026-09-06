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
// a pessoa digitou o número, seja porque um atendente puxou ela pra si —
// e nesse momento o conteúdo de "mensagens" vira histórico da própria
// Conversation (ver ConversationsService.create/iniciar), não fica só
// aqui.
@Entity('bot_sessions')
export class BotSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text', { unique: true })
  telefone: string;

  // pushName do WhatsApp (mesmo campo que vira Conversation.cliente_nome
  // quando a conversa nasce) — pré-preenche o modal de "Atender" na aba
  // Bot sem o atendente ter que digitar de novo um nome que o cliente já
  // informou. Nullable: mensagem de mídia sem legenda não tem pushName
  // capturado separado, e a primeira tentativa pode não ter vindo com nome.
  @Column('text', { nullable: true })
  nome: string | null;

  // Quantas mensagens a pessoa mandou sem acertar um número de setor. 1 é
  // o normal (acabou de chegar); 4 é gente travada, que provavelmente
  // precisa de alguém humano.
  @Column('int', { default: 1 })
  tentativas: number;

  // O que a pessoa foi escrevendo enquanto presa no menu — inclui mídia
  // (imagem/documento/áudio/vídeo mandada antes de escolher o setor, ver
  // BotSessionsService.registrarMidia): midia_path aponta pro mesmo
  // diretório do MediaStorageService, salvo com um id provisório que não
  // corresponde a nenhuma Message ainda — só passa a existir quando
  // ConversationsService.inserirHistoricoBot converte cada item num
  // registro de Message de verdade. Campos de mídia ausentes = mensagem de
  // texto puro (formato antigo, ou entrada nova sem mídia). Guardado pra o
  // atendente ver o histórico completo assim que a conversa nasce, em vez
  // de só o número do setor escolhido no final ("2", sem contexto nenhum
  // do que a pessoa queria).
  @Column('jsonb', { default: () => "'[]'" })
  mensagens: Array<{
    texto: string;
    criado_em: string;
    origem?: 'cliente' | 'bot';
    tipo?: string;
    midia_path?: string;
    midia_mimetype?: string;
    midia_nome_arquivo?: string | null;
  }>;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  atualizado_em: Date;
}
