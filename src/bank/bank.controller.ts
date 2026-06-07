import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Bank } from './bank.entity';
import { BankService } from './bank.service';

@ApiTags('bank')
@Controller('bank')
export class BankController {
  constructor(private readonly bankService: BankService) {}

  @Get()
  @ApiOkResponse({
    description: 'Current bank account information',
    type: Bank,
  })
  getBank(): Promise<Bank> {
    return this.bankService.getBank();
  }
}
