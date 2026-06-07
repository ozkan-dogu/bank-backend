import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, IsPositive } from 'class-validator';

export class CreateTransactionItemDto {
  @ApiProperty({
    example: 1,
    description: 'ID of the person making the deposit',
  })
  @IsInt()
  @IsPositive()
  personId!: number;

  @ApiProperty({
    example: 100,
    description: 'Amount to deposit, must be greater than zero',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
