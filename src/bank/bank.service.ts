import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from './bank.entity';

@Injectable()
export class BankService {
  constructor(
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  async getBank(): Promise<Bank> {
    const bank = await this.bankRepository.findOne({ where: {} });

    if (!bank) {
      throw new NotFoundException('Bank account has not been initialized yet');
    }

    return bank;
  }
}
