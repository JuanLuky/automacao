import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAutoMessagesEQuickReplies1787060971723 implements MigrationInterface {
    name = 'AddAutoMessagesEQuickReplies1787060971723'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Mensagens automáticas de Assumir/Finalizar, editáveis em /mensagens
        // (só admin) — configuração global, linha única (singleton), mesmo
        // padrão de "business_hours"/"role_labels". Antes eram texto fixo em
        // frontend/src/lib/quickReplies.ts.
        await queryRunner.query(`CREATE TABLE "auto_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "mensagem_iniciar" text NOT NULL, "mensagem_finalizar" text NOT NULL, "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_auto_messages" PRIMARY KEY ("id"))`);

        // Templates de resposta rápida do chat, também editáveis em
        // /mensagens (só admin) — antes uma lista fixa no mesmo arquivo
        // acima. "categoria" é texto livre, agrupado pelo frontend; "ordem"
        // controla a posição de exibição dentro (e entre) categorias.
        await queryRunner.query(`CREATE TABLE "quick_replies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "categoria" text NOT NULL, "texto" text NOT NULL, "ordem" integer NOT NULL DEFAULT 0, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_quick_replies" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "quick_replies"`);
        await queryRunner.query(`DROP TABLE "auto_messages"`);
    }

}
