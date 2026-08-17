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

dotenv.config();

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

  await AppDataSource.destroy();
  console.log('Seed finalizado.');
}

seed().catch((err) => {
  console.error('Erro ao rodar seed:', err);
  process.exit(1);
});
