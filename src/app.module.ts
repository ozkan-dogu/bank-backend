import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankModule } from './bank/bank.module';
import { SeedModule } from './common/seed.module';
import { buildTypeOrmConfig } from './config/typeorm.config';
import { validateEnv } from './config/env.validation';
import { HealthModule } from './health/health.module';
import { PersonsModule } from './persons/persons.module';
import { TransactionsModule } from './transactions/transactions.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: buildTypeOrmConfig,
    }),
    PersonsModule,
    BankModule,
    TransactionsModule,
    HealthModule,
    SeedModule,
  ],
})
export class AppModule {}
