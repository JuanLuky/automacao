import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBotSessions1787105853537 implements MigrationInterface {
    name = 'AddBotSessions1787105853537'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Quem mandou mensagem mas ainda não escolheu setor no menu — até
        // aqui essa pessoa não existia em lugar nenhum do sistema (a
        // Conversation só nasce depois da escolha), então ficava invisível
        // pro escritório enquanto conversava com o robô.
        //
        // Uma linha por telefone: "tentativas" conta quantas vezes a pessoa
        // escreveu sem acertar um número de setor — 1 é normal, 4 é gente
        // travada que provavelmente precisa de ajuda humana.
        await queryRunner.query(`CREATE TABLE "bot_sessions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telefone" text NOT NULL, "tentativas" integer NOT NULL DEFAULT 1, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_bot_sessions_telefone" UNIQUE ("telefone"), CONSTRAINT "PK_bot_sessions" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "bot_sessions"`);
    }

}
