import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { Bank } from '../bank/bank.entity';
import { Person } from '../persons/person.entity';
import { TransactionsService } from './transactions.service';
import { TransactionStatus } from './transaction-status.enum';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let manager: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: typeof manager;
  };
  let dataSource: { createQueryRunner: jest.Mock };

  const person: Person = { id: 1, name: 'John' };
  const bank: Bank = { id: 1, balance: 100 };

  beforeEach(async () => {
    manager = {
      findOne: jest.fn(),
      save: jest.fn((_entity: unknown, value: unknown) => Promise.resolve(value)),
      create: jest.fn((_entity: unknown, value: unknown) => value),
    };
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager,
    };
    dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TransactionsService, { provide: DataSource, useValue: dataSource }],
    }).compile();

    service = module.get(TransactionsService);
  });

  it('credits the bank balance and records a SUCCESS transaction for a valid transfer', async () => {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Person) return Promise.resolve(person);
      if (entity === Bank) return Promise.resolve({ ...bank });
      return Promise.resolve(null);
    });

    const response = await service.processBatch([{ personId: 1, amount: 50 }]);

    expect(response.results).toEqual([{ personId: 1, amount: 50, status: TransactionStatus.SUCCESS }]);
    expect(manager.save).toHaveBeenCalledWith(Bank, expect.objectContaining({ balance: 150 }));
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ personId: 1, amount: 50, status: TransactionStatus.SUCCESS }),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('records a FAILED transaction without touching the balance when personId does not exist', async () => {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Person) return Promise.resolve(null);
      return Promise.resolve({ ...bank });
    });

    const response = await service.processBatch([{ personId: 999, amount: 50 }]);

    expect(response.results).toEqual([
      {
        personId: 999,
        amount: 50,
        status: TransactionStatus.FAILED,
        reason: 'Person with id 999 was not found',
      },
    ]);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ personId: 999, status: TransactionStatus.FAILED }),
    );
    expect(manager.save).not.toHaveBeenCalledWith(Bank, expect.anything());
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('rolls back the transaction and reports FAILED when an unexpected error occurs', async () => {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Person) return Promise.resolve(person);
      return Promise.resolve({ ...bank });
    });
    manager.save.mockRejectedValueOnce(new Error('connection lost'));

    const response = await service.processBatch([{ personId: 1, amount: 50 }]);

    expect(response.results).toEqual([
      {
        personId: 1,
        amount: 50,
        status: TransactionStatus.FAILED,
        reason: 'Unexpected error while processing the transaction',
      },
    ]);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  it('processes a batch concurrently and reports the total duration', async () => {
    manager.findOne.mockImplementation((entity: unknown) => {
      if (entity === Person) return Promise.resolve(person);
      return Promise.resolve({ ...bank });
    });

    const response = await service.processBatch([
      { personId: 1, amount: 10 },
      { personId: 1, amount: 20 },
      { personId: 1, amount: 30 },
    ]);

    expect(response.results).toHaveLength(3);
    expect(response.results.every((result) => result.status === TransactionStatus.SUCCESS)).toBe(true);
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(dataSource.createQueryRunner).toHaveBeenCalledTimes(3);
  });
});
