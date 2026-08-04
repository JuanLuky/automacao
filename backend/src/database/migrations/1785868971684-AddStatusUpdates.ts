import { MigrationInterface, QueryRunner } from "typeorm";

export class AddStatusUpdates1785868971684 implements MigrationInterface {
    name = 'AddStatusUpdates1785868971684'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."status_updates_estado_enum" AS ENUM('operacional', 'instabilidade', 'indisponivel')`);
        await queryRunner.query(`CREATE TABLE "status_updates" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "estado" "public"."status_updates_estado_enum" NOT NULL, "mensagem" text NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a4dc636b9a35229ec5cee2b1dfb" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "status_updates"`);
        await queryRunner.query(`DROP TYPE "public"."status_updates_estado_enum"`);
    }

}
