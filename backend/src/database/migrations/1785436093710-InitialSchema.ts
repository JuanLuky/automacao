import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1785436093710 implements MigrationInterface {
    name = 'InitialSchema1785436093710'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Necessário pra uuid_generate_v4() nos DEFAULT das PKs abaixo — o TypeORM
        // habilita essa extensão sozinho no modo synchronize, mas migration:generate
        // não inclui esse CREATE EXTENSION automaticamente.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
        await queryRunner.query(`CREATE TABLE "departments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" character varying NOT NULL, "codigo" character varying NOT NULL, "ativo" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_d78639aee40d98e28111e4bba89" UNIQUE ("codigo"), CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'atendente')`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" character varying NOT NULL, "email" character varying NOT NULL, "senha_hash" character varying NOT NULL, "departamento_id" uuid, "role" "public"."users_role_enum" NOT NULL DEFAULT 'atendente', "ativo" boolean NOT NULL DEFAULT true, "excluido_em" TIMESTAMP WITH TIME ZONE, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."conversations_status_enum" AS ENUM('aguardando', 'em_atendimento', 'transferido', 'finalizado')`);
        await queryRunner.query(`CREATE TABLE "conversations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telefone" character varying NOT NULL, "cliente_nome" character varying, "departamento_id" uuid NOT NULL, "atendente_id" uuid, "status" "public"."conversations_status_enum" NOT NULL DEFAULT 'aguardando', "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "finalizado_em" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_ee34f4f7ced4ec8681f26bf04ef" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."messages_origem_enum" AS ENUM('cliente', 'atendente', 'sistema')`);
        await queryRunner.query(`CREATE TABLE "messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "conversation_id" uuid NOT NULL, "origem" "public"."messages_origem_enum" NOT NULL, "mensagem" text NOT NULL, "atendente_id" uuid, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "FK_3d5193fcfb3eae203e424a72102" FOREIGN KEY ("departamento_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "FK_06f7d549533d91006bd59056f32" FOREIGN KEY ("departamento_id") REFERENCES "departments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "conversations" ADD CONSTRAINT "FK_3ac172ba6f42b6a3693438f322f" FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "messages" ADD CONSTRAINT "FK_f2d127002f5b78284c5317a9864" FOREIGN KEY ("atendente_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_f2d127002f5b78284c5317a9864"`);
        await queryRunner.query(`ALTER TABLE "messages" DROP CONSTRAINT "FK_3bc55a7c3f9ed54b520bb5cfe23"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_3ac172ba6f42b6a3693438f322f"`);
        await queryRunner.query(`ALTER TABLE "conversations" DROP CONSTRAINT "FK_06f7d549533d91006bd59056f32"`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "FK_3d5193fcfb3eae203e424a72102"`);
        await queryRunner.query(`DROP TABLE "messages"`);
        await queryRunner.query(`DROP TYPE "public"."messages_origem_enum"`);
        await queryRunner.query(`DROP TABLE "conversations"`);
        await queryRunner.query(`DROP TYPE "public"."conversations_status_enum"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP TABLE "departments"`);
    }

}
