import { MigrationInterface, QueryRunner } from "typeorm";

export class AddConversationTipoGrupo1786806232746 implements MigrationInterface {
    name = 'AddConversationTipoGrupo1786806232746'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Grupo do WhatsApp não pertence a um setor — departamento_id precisa
        // deixar de ser obrigatório antes de existir uma linha com tipo = grupo.
        await queryRunner.query(`ALTER TABLE "conversations" ALTER COLUMN "departamento_id" DROP NOT NULL`);
        await queryRunner.query(`CREATE TYPE "public"."conversations_tipo_enum" AS ENUM('cliente', 'grupo')`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD "tipo" "public"."conversations_tipo_enum" NOT NULL DEFAULT 'cliente'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "conversations" DROP COLUMN "tipo"`);
        await queryRunner.query(`DROP TYPE "public"."conversations_tipo_enum"`);
        await queryRunner.query(`ALTER TABLE "conversations" ALTER COLUMN "departamento_id" SET NOT NULL`);
    }

}
