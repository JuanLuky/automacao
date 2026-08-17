import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageRemetenteEEvolutionId1786968897103 implements MigrationInterface {
    name = 'AddMessageRemetenteEEvolutionId1786968897103'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // evolution_message_id: dedup de mensagem fromMe (eco de uma mensagem
        // já enviada pelo painel vs. mensagem nova mandada direto do celular
        // conectado) — ver MessagesService.create.
        await queryRunner.query(`ALTER TABLE "messages" ADD "evolution_message_id" text`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_evolution_message_id" ON "messages" ("evolution_message_id")`);
        // remetente_nome/remetente_telefone: quem escreveu dentro de um grupo
        // do WhatsApp (várias pessoas compartilham a mesma conversa) — só
        // preenchidos quando origem = cliente e a conversa é tipo = grupo.
        await queryRunner.query(`ALTER TABLE "messages" ADD "remetente_nome" text`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "remetente_telefone" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "remetente_telefone"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "remetente_nome"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_messages_evolution_message_id"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "evolution_message_id"`);
    }

}
