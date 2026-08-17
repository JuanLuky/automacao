import { MigrationInterface, QueryRunner } from "typeorm";

export class AddRoleLabels1786987382653 implements MigrationInterface {
    name = 'AddRoleLabels1786987382653'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Configuração global (não por setor) — linha única (singleton), mesmo
        // padrão de "business_hours": rótulos de exibição pros três papéis
        // (UserRole é fixo, não dá pra criar papel novo — só o texto mostrado
        // pra cada um é editável, ver /perfis no painel).
        await queryRunner.query(`CREATE TABLE "role_labels" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "atendente" text NOT NULL, "supervisor" text NOT NULL, "admin" text NOT NULL, "atualizado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_role_labels" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "role_labels"`);
    }

}
