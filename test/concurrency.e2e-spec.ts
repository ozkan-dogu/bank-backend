import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Proves that concurrent POST /transactions requests cannot corrupt the
 * shared bank balance. Requires a running Postgres instance — see
 * `docker-compose.yml` and the "Running the tests" section of the README.
 *
 * The assertion is delta-based (finalBalance - initialBalance), so the test
 * is independent of whatever data already exists in the database.
 */
describe('Concurrency safety (e2e)', () => {
  let app: INestApplication<App>;
  let personIds: number[];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const personsResponse = await request(app.getHttpServer()).get('/persons').expect(200);
    personIds = (personsResponse.body as { id: number }[]).map((person) => person.id);
    expect(personIds.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await app.close();
  });

  async function getBalance(): Promise<number> {
    const response = await request(app.getHttpServer()).get('/bank').expect(200);
    return Number((response.body as { balance: number }).balance);
  }

  it('keeps the balance exact when many transactions are sent in a single batch', async () => {
    const initialBalance = await getBalance();

    const items = Array.from({ length: 80 }, (_, index) => ({
      personId: personIds[index % personIds.length],
      amount: 10,
    }));
    const expectedDelta = items.reduce((sum, item) => sum + item.amount, 0);

    const response = await request(app.getHttpServer()).post('/transactions').send(items).expect(201);

    const body = response.body as { results: { status: string }[] };
    expect(body.results).toHaveLength(items.length);
    expect(body.results.every((result) => result.status === 'SUCCESS')).toBe(true);

    const finalBalance = await getBalance();
    expect(finalBalance - initialBalance).toBe(expectedDelta);
  }, 60_000);

  it('keeps the balance exact when many requests arrive concurrently from different clients', async () => {
    const initialBalance = await getBalance();

    const requestCount = 50;
    const amountPerTransfer = 5;

    const responses = await Promise.all(
      Array.from({ length: requestCount }, (_, index) =>
        request(app.getHttpServer())
          .post('/transactions')
          .send([{ personId: personIds[index % personIds.length], amount: amountPerTransfer }])
          .expect(201),
      ),
    );

    for (const response of responses) {
      const body = response.body as { results: { status: string }[] };
      expect(body.results[0]?.status).toBe('SUCCESS');
    }

    const finalBalance = await getBalance();
    expect(finalBalance - initialBalance).toBe(requestCount * amountPerTransfer);
  }, 120_000);
});
