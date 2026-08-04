import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBusinessHours1785869016375 implements MigrationInterface {
    name = 'AddBusinessHours1785869016375'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "business_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "dias_funcionamento" integer array NOT NULL, "hora_inicio" character varying NOT NULL, "hora_fim" character varying NOT NULL, "mensagem_fora_horario" text NOT NULL, "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_560a76077605005da835fe505a5" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "business_hours"`);
    }

}
