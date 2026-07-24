import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Department } from '../../departments/entities/department.entity';

export enum UserRole {
  ADMIN = 'admin',
  ATENDENTE = 'atendente',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nome: string;

  @Column({ unique: true })
  email: string;

  // Nunca retornar esse campo nas respostas da API (ver UserResponseDto)
  @Column()
  senha_hash: string;

  @Column({ type: 'uuid', nullable: true })
  departamento_id: string | null;

  @ManyToOne(() => Department, { nullable: true })
  @JoinColumn({ name: 'departamento_id' })
  departamento: Department;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.ATENDENTE })
  role: UserRole;

  @Column({ default: true })
  ativo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  criado_em: Date;
}
