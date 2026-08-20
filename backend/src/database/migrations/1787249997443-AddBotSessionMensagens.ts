import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBotSessionMensagens1787249997443 implements MigrationInterface {
    name = 'AddBotSessionMensagens1787249997443'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Texto de cada mensagem que a pessoa mandou enquanto ainda estava
        // presa no menu (antes de escolher um setor válido) — até aqui
        // bot_sessions só contava "tentativas", sem guardar o que foi
        // escrito. Guardado como array json ("[{texto, criado_em}, ...]")
        // em vez de uma tabela à parte porque é sempre lido/escrito inteiro
        // de uma vez (nunca uma mensagem isolada) e some junto com a sessão
        // assim que a conversa nasce — ver ConversationsService.create.
        await queryRunner.query(`ALTER TABLE "bot_sessions" ADD "mensagens" jsonb NOT NULL DEFAULT '[]'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bot_sessions" DROP COLUMN "mensagens"`);
    }

}
