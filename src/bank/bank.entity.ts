import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ValueTransformer,
} from 'typeorm';

const numericTransformer: ValueTransformer = {
  to: (value?: number) => value,
  from: (value?: string) =>
    value === null || value === undefined ? value : Number(value),
};

@Entity()
export class Bank {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id!: number;

  @ApiProperty({ example: 500 })
  @Column('numeric', {
    precision: 14,
    scale: 2,
    default: 0,
    transformer: numericTransformer,
  })
  balance!: number;
}
