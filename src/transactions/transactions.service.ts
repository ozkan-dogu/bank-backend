import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { Bank } from '../bank/bank.entity';
import { Person } from '../persons/person.entity';
import { CreateTransactionItemDto } from './dto/create-transaction-item.dto';
import {
  ProcessTransactionsResponseDto,
  TransactionResultDto,
} from './dto/process-transactions-response.dto';
import { Transaction } from './transaction.entity';
import { TransactionStatus } from './transaction-status.enum';

const RECENT_TRANSACTIONS_LIMIT = 50;

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(private readonly dataSource: DataSource) {}

  findRecent(): Promise<Transaction[]> {
    return this.dataSource.getRepository(Transaction).find({
      order: { createdAt: 'DESC' },
      take: RECENT_TRANSACTIONS_LIMIT,
    });
  }

  async processBatch(
    items: CreateTransactionItemDto[],
  ): Promise<ProcessTransactionsResponseDto> {
    const startedAt = Date.now();

    const results = await Promise.all(
      items.map((item) => this.processSingleTransfer(item)),
    );

    return {
      results,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Each transfer runs in its own transaction so that transfers remain
   * independent and genuinely concurrent at the application level: a failure
   * in one cannot roll back or block the others. Correctness of the shared
   * balance is guaranteed by taking a `SELECT ... FOR UPDATE` (pessimistic
   * write lock) on the single Bank row before reading and updating it —
   * Postgres serializes any concurrent transactions that try to lock the same
   * row, which eliminates the read-modify-write race on `balance`.
   */
  private async processSingleTransfer(
    item: CreateTransactionItemDto,
  ): Promise<TransactionResultDto> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const person = await queryRunner.manager.findOne(Person, {
        where: { id: item.personId },
      });

      if (!person) {
        await this.saveTransaction(queryRunner, item, TransactionStatus.FAILED);
        await queryRunner.commitTransaction();
        return this.toResult(
          item,
          TransactionStatus.FAILED,
          `Person with id ${item.personId} was not found`,
        );
      }

      const bank = await queryRunner.manager.findOne(Bank, {
        where: {},
        lock: { mode: 'pessimistic_write' },
      });

      if (!bank) {
        throw new Error('Bank account has not been initialized');
      }

      bank.balance = Number(bank.balance) + item.amount;
      await queryRunner.manager.save(Bank, bank);
      await this.saveTransaction(queryRunner, item, TransactionStatus.SUCCESS);

      await queryRunner.commitTransaction();
      return this.toResult(item, TransactionStatus.SUCCESS);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to process transfer for person ${item.personId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return this.toResult(
        item,
        TransactionStatus.FAILED,
        'Unexpected error while processing the transaction',
      );
    } finally {
      await queryRunner.release();
    }
  }

  private saveTransaction(
    queryRunner: QueryRunner,
    item: CreateTransactionItemDto,
    status: TransactionStatus,
  ): Promise<Transaction> {
    const transaction = queryRunner.manager.create(Transaction, {
      personId: item.personId,
      amount: item.amount,
      status,
    });
    return queryRunner.manager.save(Transaction, transaction);
  }

  private toResult(
    item: CreateTransactionItemDto,
    status: TransactionStatus,
    reason?: string,
  ): TransactionResultDto {
    return { personId: item.personId, amount: item.amount, status, reason };
  }
}
