import { MigrationInterface, QueryRunner } from "typeorm";

export class AddContacts1786970027071 implements MigrationInterface {
    name = 'AddContacts1786970027071'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Lista de contatos gerenciada pelo Maré (adicionar/editar/excluir/
        // importar) — independente dos contatos sincronizados ao vivo do
        // WhatsApp conectado (esses nunca são persistidos, ver
        // EvolutionService.getContacts). "telefone" é único: evita cadastrar
        // o mesmo número duas vezes por essa tela.
        await queryRunner.query(`CREATE TABLE "contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "nome" text NOT NULL, "telefone" text NOT NULL, "criado_em" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_contacts_telefone" UNIQUE ("telefone"), CONSTRAINT "PK_contacts" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "contacts"`);
    }

}
