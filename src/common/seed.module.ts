import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bank } from '../bank/bank.entity';
import { Person } from '../persons/person.entity';
import { SeedService } from './seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Person, Bank])],
  providers: [SeedService],
})
export class SeedModule {}
