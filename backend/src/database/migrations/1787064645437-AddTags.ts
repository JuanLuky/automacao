import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTags1787064645437 implements MigrationInterface {
    name = 'AddTags1787064645437'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Catálogo de etiquetas (nome + cor), editável em /etiquetas (só
        // admin) — ex: "Devedor", "Cliente Premium". "nome" é único pra
        // evitar duplicidade no catálogo.
        await queryRunner.query(`CREATE TABLE "tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" text NOT NULL, "cor" text NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_tags_nome" UNIQUE ("nome"), CONSTRAINT "PK_tags" PRIMARY KEY ("id"))`);

        // Vínculo etiqueta <-> TELEFONE (não Conversation) — uma
        // característica do cliente precisa sobreviver entre atendimentos,
        // e cada atendimento novo é uma Conversation nova depois que a
        // anterior é finalizada. Sem FK pra conversations/contacts de
        // propósito. ON DELETE CASCADE: excluir uma etiqueta do catálogo
        // remove ela de todo cliente que a tinha, sem exigir limpeza manual.
        await queryRunner.query(`CREATE TABLE "client_tags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telefone" text NOT NULL, "tag_id" uuid NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_client_tags_telefone_tag" UNIQUE ("telefone", "tag_id"), CONSTRAINT "PK_client_tags" PRIMARY KEY ("id"), CONSTRAINT "FK_client_tags_tag" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "client_tags"`);
        await queryRunner.query(`DROP TABLE "tags"`);
    }

}
