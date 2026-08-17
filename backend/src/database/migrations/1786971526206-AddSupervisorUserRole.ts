import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSupervisorUserRole1786971526206 implements MigrationInterface {
    name = 'AddSupervisorUserRole1786971526206'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Recria o enum com o valor novo em vez de ALTER TYPE ... ADD VALUE —
        // mesmo padrão já usado em AddVideoMessageTipo (essa forma não pode
        // ser usada na mesma transação que já lê o valor novo, e as migrations
        // deste projeto rodam em transação).
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'atendente', 'supervisor')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::text::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'atendente'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'atendente')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::text::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'atendente'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
    }

}
