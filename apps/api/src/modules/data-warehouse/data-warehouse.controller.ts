import { Controller, Put, Post, Get, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiOkResponse, ApiBadRequestResponse, ApiForbiddenResponse } from '@nestjs/swagger';
import { DataWarehouseService } from './data-warehouse.service';
import { DataWarehouseRecordDto } from './dto/data-warehouse-push.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { M2MAuthGuard } from '../../common/guards/m2m-auth.guard';

@ApiTags('Data Warehouse')
@ApiBearerAuth('access-token')
@Controller('data-warehouse')
export class DataWarehouseController {
  constructor(private readonly dataWarehouseService: DataWarehouseService) {}

  @Put('push')
  @UseGuards(M2MAuthGuard)
  @ApiOperation({
    summary: 'Receive data from data warehouse ETL',
    description:
      'Accepts a JSON array of OPI records from the data warehouse. ' +
      'Replaces all existing staging data. New batch is created with status PENDING. ' +
      'Requires Auth0 M2M client-credentials token.',
  })
  @ApiBody({
    type: [DataWarehouseRecordDto],
    description: 'Array of OPI student/class records from the data warehouse',
    examples: {
      example: {
        summary: 'Sample push payload',
        value: [
          {
            OPI_TYPE: 'French Immersion Programs',
            SCHOOL_NUMBER: 9898001,
            SCHOOL_NAME: 'F.H. Collins Secondary School',
            SCHOOL_TYPE: '8-12',
            SCHOOL_YEAR: 2026,
            STUDENT_NUMBER: 1279128,
            PEN: 521812040,
            STUDENT_LAST_NAME: 'Manning',
            STUDENT_FIRST_NAME: 'Khaleesi',
            STUDENT_MIDDLE_NAME: 'Anais',
            GRADE: 9,
            COURSE: 'FFRAL09 01',
            COURSE_TITLE: 'FRANÇAIS LANGUE SECONDE-IMMERSION 9',
            TEACHER_ID: '718888',
            TEACHER_NAME: 'Kathryn Kimber',
            SEMESTER_TERM: 'S1',
            PROGRAM_CODE: '98 FI',
            PROGRAM_DESCRIPTION: 'French Immersion',
          },
        ],
      },
    },
  })
  @ApiOkResponse({
    description: 'Records staged successfully',
    schema: {
      type: 'object',
      properties: {
        batchId: { type: 'integer', example: 5 },
        status: { type: 'string', example: 'PENDING' },
        recordCount: { type: 'integer', example: 342 },
        targetYear: { type: 'integer', example: 2026 },
        receivedAt: { type: 'string', format: 'date-time', example: '2026-04-13T18:30:00.000Z' },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'No records provided or validation error' })
  @ApiForbiddenResponse({ description: 'Missing or invalid M2M client-credentials token' })
  async pushData(@Body() records: DataWarehouseRecordDto[]) {
    return this.dataWarehouseService.pushData(records);
  }

  @Post('seed')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Trigger seeding from staging data into app tables',
    description:
      'Admin triggers the actual ETL: reuses or creates a cycle, ' +
      'and seeds schools, programs, teachers, students, classes, and enrollments ' +
      'from the pending staging batch. No request body needed.',
  })
  @ApiOkResponse({
    description: 'Seeding completed successfully',
    schema: {
      type: 'object',
      properties: {
        batchId: { type: 'integer', example: 5 },
        status: { type: 'string', example: 'SEEDED' },
        cycleId: { type: 'integer', example: 3 },
        cycleName: { type: 'string', example: 'Assessment Cycle 2026' },
        summary: {
          type: 'object',
          properties: {
            schools: { type: 'integer', example: 12 },
            programs: { type: 'integer', example: 4 },
            teachers: { type: 'integer', example: 28 },
            students: { type: 'integer', example: 342 },
            classes: { type: 'integer', example: 52 },
            enrollments: { type: 'integer', example: 342 },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'No pending batch found — push data first' })
  async seedFromStaging() {
    return this.dataWarehouseService.seedFromStaging();
  }

  @Get('status')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Get latest data warehouse batch status',
    description: 'Returns the status of the most recent data warehouse batch.',
  })
  @ApiOkResponse({
    description: 'Latest batch status',
    schema: {
      type: 'object',
      properties: {
        batchId: { type: 'integer', example: 5 },
        status: { type: 'string', enum: ['PENDING', 'SEEDING', 'SEEDED', 'FAILED'], example: 'SEEDED' },
        recordCount: { type: 'integer', example: 342 },
        targetYear: { type: 'integer', example: 2026 },
        receivedAt: { type: 'string', format: 'date-time', example: '2026-04-13T18:30:00.000Z' },
        seededAt: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-13T18:31:05.000Z' },
        errorMessage: { type: 'string', nullable: true, example: null },
      },
    },
  })
  async getStatus() {
    return this.dataWarehouseService.getStatus();
  }
}
