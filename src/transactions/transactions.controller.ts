import { Body, Controller, Get, ParseArrayPipe, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateTransactionItemDto } from './dto/create-transaction-item.dto';
import { ProcessTransactionsResponseDto } from './dto/process-transactions-response.dto';
import { Transaction } from './transaction.entity';
import { TransactionsService } from './transactions.service';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  @ApiOkResponse({
    description: 'Most recent transactions, newest first',
    type: [Transaction],
  })
  findRecent(): Promise<Transaction[]> {
    return this.transactionsService.findRecent();
  }

  @Post()
  @ApiBody({ type: [CreateTransactionItemDto] })
  @ApiCreatedResponse({
    description: 'Result of processing the batch of transactions concurrently',
    type: ProcessTransactionsResponseDto,
  })
  create(
    @Body(new ParseArrayPipe({ items: CreateTransactionItemDto }))
    items: CreateTransactionItemDto[],
  ): Promise<ProcessTransactionsResponseDto> {
    return this.transactionsService.processBatch(items);
  }
}
