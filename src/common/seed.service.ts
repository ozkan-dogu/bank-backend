import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from '../bank/bank.entity';
import { Person } from '../persons/person.entity';

const SEED_PERSON_NAMES = ['John', 'Mike', 'Sarah', 'Anna', 'Alex'];

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(Person)
    private readonly personsRepository: Repository<Person>,
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPersons();
    await this.seedBank();
  }

  private async seedPersons(): Promise<void> {
    const existingCount = await this.personsRepository.count();

    if (existingCount > 0) {
      return;
    }

    const persons = SEED_PERSON_NAMES.map((name) =>
      this.personsRepository.create({ name }),
    );
    await this.personsRepository.save(persons);
    this.logger.log(`Seeded persons: ${SEED_PERSON_NAMES.join(', ')}`);
  }

  private async seedBank(): Promise<void> {
    const existingCount = await this.bankRepository.count();

    if (existingCount > 0) {
      return;
    }

    await this.bankRepository.save(this.bankRepository.create({ balance: 0 }));
    this.logger.log('Seeded bank account with balance 0');
  }
}
