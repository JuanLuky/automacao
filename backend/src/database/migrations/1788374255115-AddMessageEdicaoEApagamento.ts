import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageEdicaoEApagamento1788374255115 implements MigrationInterface {
    name = 'AddMessageEdicaoEApagamento1788374255115'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // editado_em/apagado_em: editar/apagar-para-todos de mensagem que o
        // próprio atendente mandou (corrigir erro de digitação ou de envio) —
        // ver MessagesService.editar/apagar.
        await queryRunner.query(`ALTER TABLE "messages" ADD "editado_em" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "apagado_em" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "apagado_em"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "editado_em"`);
    }

}
