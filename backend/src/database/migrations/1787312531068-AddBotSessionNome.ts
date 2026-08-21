import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBotSessionNome1787312531068 implements MigrationInterface {
    name = 'AddBotSessionNome1787312531068'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // pushName do WhatsApp — pré-preenche o modal "Iniciar conversa" ao
        // atender pela aba Bot, sem o atendente digitar de novo um nome que
        // o cliente já informou (mesmo campo que vira Conversation.cliente_nome
        // quando a conversa nasce pelo fluxo normal).
        await queryRunner.query(`ALTER TABLE "bot_sessions" ADD "nome" text`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "bot_sessions" DROP COLUMN "nome"`);
    }

}
