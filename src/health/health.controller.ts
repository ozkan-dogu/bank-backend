import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';

class HealthResponse {
  status!: 'ok' | 'error';
  database!: 'connected' | 'disconnected';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  @ApiOkResponse({
    description: 'Application and database health status',
    type: HealthResponse,
  })
  async check(): Promise<HealthResponse> {
    const databaseConnected =
      this.dataSource.isInitialized && (await this.isDatabaseReachable());

    return {
      status: databaseConnected ? 'ok' : 'error',
      database: databaseConnected ? 'connected' : 'disconnected',
    };
  }

  private async isDatabaseReachable(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
