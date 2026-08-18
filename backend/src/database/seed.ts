import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from './data-source';
import { Department } from '../departments/entities/department.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { BusinessHours } from '../business-hours/entities/business-hours.entity';
import { BUSINESS_HOURS_PADRAO } from '../business-hours/business-hours.service';
import { RoleLabels } from '../role-labels/entities/role-labels.entity';
import { ROLE_LABELS_PADRAO } from '../role-labels/role-labels.service';
import { AutoMessages } from '../auto-messages/entities/auto-messages.entity';
import { AUTO_MESSAGES_PADRAO } from '../auto-messages/auto-messages.service';
import { QuickReply } from '../quick-replies/entities/quick-reply.entity';

dotenv.config();

// Lista original que vivia em frontend/src/lib/quickReplies.ts antes de virar
// editável em /mensagens — usada só como seed inicial (idempotente: só roda
// se a tabela estiver vazia, editar/excluir pela tela depois é normal).
const QUICK_REPLIES_PADRAO: { categoria: string; texto: string }[] = [
  {
    categoria: 'Abertura/Acolhimento',
    texto: 'Olá! Tudo bem? Meu nome é [nome do atendente], vou te ajudar por aqui.',
  },
  { categoria: 'Abertura/Acolhimento', texto: 'Oi! Recebi sua mensagem, já estou verificando.' },
  { categoria: 'Aguarde/Em análise', texto: 'Só um momento, estou verificando isso pra você.' },
  { categoria: 'Aguarde/Em análise', texto: 'Vou confirmar essa informação e já te retorno.' },
  {
    categoria: 'Aguarde/Em análise',
    texto: 'Peço desculpas pela demora, ainda estou analisando seu caso.',
  },
  {
    categoria: 'Pedido de informação',
    texto: 'Poderia me confirmar seu nome completo e CPF, por favor?',
  },
  { categoria: 'Pedido de informação', texto: 'Você pode me enviar mais detalhes sobre isso?' },
  { categoria: 'Pedido de informação', texto: 'Tem algum número de pedido/protocolo relacionado?' },
  { categoria: 'Encerramento', texto: 'Fico feliz em ajudar! Precisando, é só chamar por aqui.' },
  { categoria: 'Encerramento', texto: 'Fico à disposição! Tenha um ótimo dia.' },
  {
    categoria: 'Transferência',
    texto: 'Vou te transferir para o setor de [setor], que vai continuar seu atendimento.',
  },
  {
    categoria: 'Transferência',
    texto: 'Um momento, vou direcionar você para quem pode te ajudar melhor com isso.',
  },
  {
    categoria: 'Fora do horário / alta demanda',
    texto: 'No momento estamos com um volume alto de atendimentos, mas já já te respondo.',
  },
  {
    categoria: 'Fora do horário / alta demanda',
    texto:
      'Nosso horário de atendimento é de [horário] — já anotei sua mensagem e responderemos assim que possível.',
  },
];

const DEPARTAMENTOS_PADRAO = [
  { nome: 'RH', codigo: 'RH' },
  { nome: 'Financeiro', codigo: 'FIN' },
  { nome: 'Contabilidade', codigo: 'CONT' },
  { nome: 'TI', codigo: 'TI' },
  { nome: 'Comercial', codigo: 'COM' },
];

async function seed() {
  await AppDataSource.initialize();

  const departmentsRepo = AppDataSource.getRepository(Department);
  const usersRepo = AppDataSource.getRepository(User);
  const businessHoursRepo = AppDataSource.getRepository(BusinessHours);
  const roleLabelsRepo = AppDataSource.getRepository(RoleLabels);
  const autoMessagesRepo = AppDataSource.getRepository(AutoMessages);
  const quickRepliesRepo = AppDataSource.getRepository(QuickReply);

  for (const dep of DEPARTAMENTOS_PADRAO) {
    const existente = await departmentsRepo.findOne({
      where: { codigo: dep.codigo },
    });
    if (!existente) {
      await departmentsRepo.save(departmentsRepo.create(dep));
      console.log(`Departamento criado: ${dep.nome}`);
    }
  }

  const emailAdmin = 'admin@empresa.com';
  const senhaAdmin = 'admin123'; // troque depois do primeiro login

  const adminExistente = await usersRepo.findOne({
    where: { email: emailAdmin },
  });

  if (!adminExistente) {
    const senha_hash = await bcrypt.hash(senhaAdmin, 10);
    await usersRepo.save(
      usersRepo.create({
        nome: 'Administrador',
        email: emailAdmin,
        senha_hash,
        role: UserRole.ADMIN,
      }),
    );
    console.log(`Usuário admin criado: ${emailAdmin} / senha: ${senhaAdmin}`);
  } else {
    console.log('Usuário admin já existe, pulando.');
  }

  const businessHoursExistente = await businessHoursRepo.find({ take: 1 });
  if (businessHoursExistente.length === 0) {
    await businessHoursRepo.save(businessHoursRepo.create(BUSINESS_HOURS_PADRAO));
    console.log('Horário de funcionamento padrão criado.');
  } else {
    console.log('Horário de funcionamento já configurado, pulando.');
  }

  const roleLabelsExistente = await roleLabelsRepo.find({ take: 1 });
  if (roleLabelsExistente.length === 0) {
    await roleLabelsRepo.save(roleLabelsRepo.create(ROLE_LABELS_PADRAO));
    console.log('Rótulos de papéis padrão criados.');
  } else {
    console.log('Rótulos de papéis já configurados, pulando.');
  }

  const autoMessagesExistente = await autoMessagesRepo.find({ take: 1 });
  if (autoMessagesExistente.length === 0) {
    await autoMessagesRepo.save(autoMessagesRepo.create(AUTO_MESSAGES_PADRAO));
    console.log('Mensagens automáticas padrão criadas.');
  } else {
    console.log('Mensagens automáticas já configuradas, pulando.');
  }

  const quickRepliesExistentes = await quickRepliesRepo.find({ take: 1 });
  if (quickRepliesExistentes.length === 0) {
    await quickRepliesRepo.save(
      QUICK_REPLIES_PADRAO.map((item, index) =>
        quickRepliesRepo.create({ ...item, ordem: index }),
      ),
    );
    console.log('Respostas rápidas padrão criadas.');
  } else {
    console.log('Respostas rápidas já configuradas, pulando.');
  }

  await AppDataSource.destroy();
  console.log('Seed finalizado.');
}

seed().catch((err) => {
  console.error('Erro ao rodar seed:', err);
  process.exit(1);
});
