import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';
import { TransactionStatus } from './transaction-status.enum';

const numericTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string) =>
    value === null || value === undefined ? value : Number(value),
};

@Entity()
export class Transaction {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 1 })
  @Index()
  @Column()
  personId!: number;

  @ApiProperty({ example: 100 })
  @Column('numeric', {
    precision: 14,
    scale: 2,
    transformer: numericTransformer,
  })
  amount!: number;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.SUCCESS })
  @Column({ type: 'enum', enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ example: '2026-06-07T12:34:56.000Z' })
  @Index()
  @CreateDateColumn()
  createdAt!: Date;
}
