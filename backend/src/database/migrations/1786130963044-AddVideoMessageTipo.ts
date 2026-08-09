import { MigrationInterface, QueryRunner } from "typeorm";

export class AddVideoMessageTipo1786130963044 implements MigrationInterface {
    name = 'AddVideoMessageTipo1786130963044'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Recria o enum com o valor novo em vez de ALTER TYPE ... ADD VALUE:
        // essa forma não pode ser usada na mesma transação que já lê o valor
        // novo, e o padrão de migration deste projeto roda dentro de uma
        // transação (ver InitialSchema/AddMessageMedia para o mesmo estilo
        // de recriação de enum).
        await queryRunner.query(`ALTER TYPE "public"."messages_tipo_enum" RENAME TO "messages_tipo_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."messages_tipo_enum" AS ENUM('texto', 'imagem', 'audio', 'documento', 'video')`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" TYPE "public"."messages_tipo_enum" USING "tipo"::text::"public"."messages_tipo_enum"`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" SET DEFAULT 'texto'`);
        await queryRunner.query(`DROP TYPE "public"."messages_tipo_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."messages_tipo_enum" RENAME TO "messages_tipo_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."messages_tipo_enum" AS ENUM('texto', 'imagem', 'audio', 'documento')`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" TYPE "public"."messages_tipo_enum" USING "tipo"::text::"public"."messages_tipo_enum"`);
        await queryRunner.query(`ALTER TABLE "messages" ALTER COLUMN "tipo" SET DEFAULT 'texto'`);
        await queryRunner.query(`DROP TYPE "public"."messages_tipo_enum_old"`);
    }

}
