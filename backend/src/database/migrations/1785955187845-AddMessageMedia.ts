import { MigrationInterface, QueryRunner } from "typeorm";

export class AddMessageMedia1785955187845 implements MigrationInterface {
    name = 'AddMessageMedia1785955187845'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."messages_tipo_enum" AS ENUM('texto', 'imagem', 'audio', 'documento')`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "tipo" "public"."messages_tipo_enum" NOT NULL DEFAULT 'texto'`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "midia_path" text`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "midia_mimetype" text`);
        await queryRunner.query(`ALTER TABLE "messages" ADD "midia_nome_arquivo" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "midia_nome_arquivo"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "midia_mimetype"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "midia_path"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP COLUMN "tipo"`);
        await queryRunner.query(`DROP TYPE "public"."messages_tipo_enum"`);
    }

}
