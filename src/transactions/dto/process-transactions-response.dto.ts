import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../transaction-status.enum';

export class TransactionResultDto {
  @ApiProperty({ example: 1 })
  personId!: number;

  @ApiProperty({ example: 100 })
  amount!: number;

  @ApiProperty({ enum: TransactionStatus, example: TransactionStatus.SUCCESS })
  status!: TransactionStatus;

  @ApiProperty({
    example: 'Person with id 1 was not found',
    required: false,
    description: 'Present when the transaction failed',
  })
  reason?: string;
}

export class ProcessTransactionsResponseDto {
  @ApiProperty({ type: [TransactionResultDto] })
  results!: TransactionResultDto[];

  @ApiProperty({
    example: 42,
    description: 'Time taken to process the whole batch, in milliseconds',
  })
  durationMs!: number;
}
