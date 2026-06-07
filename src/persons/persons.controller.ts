import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Person } from './person.entity';
import { PersonsService } from './persons.service';

@ApiTags('persons')
@Controller('persons')
export class PersonsController {
  constructor(private readonly personsService: PersonsService) {}

  @Get()
  @ApiOkResponse({ description: 'List of all persons', type: [Person] })
  findAll(): Promise<Person[]> {
    return this.personsService.findAll();
  }
}
