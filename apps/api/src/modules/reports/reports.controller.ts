import {
    Controller,
    Get,
    Query,
    BadRequestException,
    Header,
    StreamableFile,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiOkResponse, ApiBadRequestResponse, ApiProduces } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CyclesService } from '../cycles/cycles.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller('reports')
export class ReportsController {
    constructor(
        private readonly reportsService: ReportsService,
        private readonly cyclesService: CyclesService,
    ) { }

    private async resolveCycleId(cycleId?: string): Promise<number> {
        if (cycleId) {
            const parsed = parseInt(cycleId, 10);
            if (isNaN(parsed)) {
                throw new BadRequestException('cycleId must be a valid number');
            }
            return parsed;
        }

        const activeCycle = await this.cyclesService.getActiveCycle();
        if (!activeCycle) {
            throw new BadRequestException('No active cycle found. Please provide a cycleId.');
        }
        return activeCycle.id;
    }

    /**
     * GET /reports/export?cycleId=&roundId=
     * M2M export endpoint — returns minimal fields (student_number, opi_level, status).
     * Accessible via M2M scope `reports:export` OR ADMIN role.
     * Always returns JSON. Use /reports/export/csv for CSV format.
     */
    @Get('export')
    @Scopes('reports:export')
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Export assessment results as JSON (student number, OPI level, status). M2M-friendly endpoint' })
    @ApiQuery({ name: 'cycleId', required: false, type: 'integer', description: 'Defaults to the active cycle if omitted', example: 3 })
    @ApiQuery({ name: 'roundId', required: false, type: 'integer', description: 'Filter by assessment round', example: 1 })
    @ApiOkResponse({
        description: 'Array of minimal export rows',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    student_number: { type: 'string', example: '1279128' },
                    opi_level: { type: 'integer', nullable: true, example: 4 },
                    opi_level_description: { type: 'string', nullable: true, example: 'Intermediate' },
                    status: { type: 'string', enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABSENT'], example: 'COMPLETED' },
                    completed_at: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-10T14:22:00.000Z' },
                },
            },
        },
    })
    @ApiBadRequestResponse({ description: 'Invalid cycleId or no active cycle found' })
    async exportData(
        @Query('cycleId') cycleId?: string,
        @Query('roundId') roundId?: string,
    ) {
        const resolvedCycleId = await this.resolveCycleId(cycleId);

        return this.reportsService.getExportData({
            cycleId: resolvedCycleId,
            roundId: roundId ? parseInt(roundId, 10) : undefined,
        });
    }

    /**
     * GET /reports/export/csv?cycleId=&roundId=
     * M2M export as CSV download.
     */
    @Get('export/csv')
    @Scopes('reports:export')
    @Roles('ADMIN')
    @Header('Content-Type', 'text/csv')
    @ApiOperation({ summary: 'Export assessment results as a CSV download. M2M-friendly endpoint' })
    @ApiProduces('text/csv')
    @ApiQuery({ name: 'cycleId', required: false, type: 'integer', description: 'Defaults to the active cycle if omitted', example: 3 })
    @ApiQuery({ name: 'roundId', required: false, type: 'integer', description: 'Filter by assessment round', example: 1 })
    @ApiOkResponse({
        description: 'CSV file download with columns: student_number, opi_level, opi_level_description, status, completed_at',
        content: {
            'text/csv': {
                example: 'student_number,opi_level,opi_level_description,status,completed_at\n1279128,4,Intermediate,COMPLETED,2026-04-10T14:22:00.000Z',
            },
        },
    })
    async exportDataCsv(
        @Query('cycleId') cycleId?: string,
        @Query('roundId') roundId?: string,
    ) {
        const resolvedCycleId = await this.resolveCycleId(cycleId);

        const data = await this.reportsService.getExportData({
            cycleId: resolvedCycleId,
            roundId: roundId ? parseInt(roundId, 10) : undefined,
        });

        const csv = this.reportsService.toCsv(
            data as unknown as Record<string, unknown>[],
        );
        return new StreamableFile(Buffer.from(csv, 'utf-8'));
    }

    /**
     * GET /reports/progress?cycleId=&roundId=
     * Coordinator progress report with full student details (JSON).
     */
    @Get('progress')
    @Roles('COORDINATOR', 'ADMIN')
    @ApiOperation({ summary: 'Detailed progress report with full student information (coordinator view)' })
    @ApiQuery({ name: 'cycleId', required: false, type: 'integer', description: 'Defaults to the active cycle if omitted', example: 3 })
    @ApiQuery({ name: 'roundId', required: false, type: 'integer', description: 'Filter by assessment round', example: 1 })
    @ApiOkResponse({
        description: 'Array of detailed student progress rows with audit history',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    student_number: { type: 'string', example: '1279128' },
                    first_name: { type: 'string', example: 'Khaleesi' },
                    last_name: { type: 'string', example: 'Manning' },
                    grade: { type: 'integer', nullable: true, example: 9 },
                    school_name: { type: 'string', example: 'F.H. Collins Secondary School' },
                    school_code: { type: 'string', example: '9898001' },
                    class_code: { type: 'string', example: 'FFRAL09 01' },
                    program_name: { type: 'string', nullable: true, example: 'French Immersion' },
                    evaluator_name: { type: 'string', nullable: true, example: 'Marie Dupont' },
                    status: { type: 'string', enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABSENT'], example: 'COMPLETED' },
                    opi_level: { type: 'integer', nullable: true, example: 4 },
                    opi_level_description: { type: 'string', nullable: true, example: 'Intermediate' },
                    started_at: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-08T09:00:00.000Z' },
                    completed_at: { type: 'string', format: 'date-time', nullable: true, example: '2026-04-10T14:22:00.000Z' },
                    has_audio: { type: 'boolean', example: true },
                    needs_review: { type: 'boolean', example: false },
                    audit_history: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                action: { type: 'string', example: 'ASSESSMENT_COMPLETE' },
                                field_name: { type: 'string', nullable: true, example: 'status' },
                                old_value: { type: 'string', nullable: true, example: 'IN_PROGRESS' },
                                new_value: { type: 'string', nullable: true, example: 'COMPLETED' },
                                changed_by: {
                                    type: 'object',
                                    nullable: true,
                                    properties: {
                                        id: { type: 'integer', example: 7 },
                                        first_name: { type: 'string', example: 'Marie' },
                                        last_name: { type: 'string', example: 'Dupont' },
                                        email: { type: 'string', example: 'marie.dupont@test.com' },
                                    },
                                },
                                changed_at: { type: 'string', format: 'date-time', example: '2026-04-10T14:22:00.000Z' },
                            },
                        },
                    },
                },
            },
        },
    })
    async progressReport(
        @Query('cycleId') cycleId?: string,
        @Query('roundId') roundId?: string,
    ) {
        const resolvedCycleId = await this.resolveCycleId(cycleId);

        return this.reportsService.getProgressReport({
            cycleId: resolvedCycleId,
            roundId: roundId ? parseInt(roundId, 10) : undefined,
        });
    }

    /**
     * GET /reports/progress/csv?cycleId=&roundId=
     * Coordinator progress report as CSV download.
     */
    @Get('progress/csv')
    @Roles('COORDINATOR', 'ADMIN')
    @Header('Content-Type', 'text/csv')
    @ApiOperation({ summary: 'Progress report as a CSV download' })
    @ApiProduces('text/csv')
    @ApiQuery({ name: 'cycleId', required: false, type: 'integer', description: 'Defaults to the active cycle if omitted', example: 3 })
    @ApiQuery({ name: 'roundId', required: false, type: 'integer', description: 'Filter by assessment round', example: 1 })
    @ApiOkResponse({
        description: 'CSV file with columns: student_number, first_name, last_name, grade, school_name, school_code, class_code, program_name, evaluator_name, status, opi_level, opi_level_description, started_at, completed_at, has_audio, needs_review',
        content: {
            'text/csv': {
                example: 'student_number,first_name,last_name,grade,school_name,school_code,class_code,program_name,evaluator_name,status,opi_level,opi_level_description,started_at,completed_at,has_audio,needs_review\n1279128,Khaleesi,Manning,9,F.H. Collins Secondary School,9898001,FFRAL09 01,French Immersion,Marie Dupont,COMPLETED,4,Intermediate,2026-04-08T09:00:00.000Z,2026-04-10T14:22:00.000Z,true,false',
            },
        },
    })
    async progressReportCsv(
        @Query('cycleId') cycleId?: string,
        @Query('roundId') roundId?: string,
    ) {
        const resolvedCycleId = await this.resolveCycleId(cycleId);

        const data = await this.reportsService.getProgressReport({
            cycleId: resolvedCycleId,
            roundId: roundId ? parseInt(roundId, 10) : undefined,
        });

        const csv = this.reportsService.toCsv(
            data as unknown as Record<string, unknown>[],
        );
        return new StreamableFile(Buffer.from(csv, 'utf-8'));
    }

    /**
     * GET /reports/summary?cycleId=
     * Export summary with stats — used by admin export page.
     */
    @Get('summary')
    @Roles('COORDINATOR', 'ADMIN')
    @ApiOperation({ summary: 'Export summary with aggregated statistics for a cycle' })
    @ApiQuery({ name: 'cycleId', required: false, type: 'integer', description: 'Defaults to the active cycle if omitted', example: 3 })
    @ApiOkResponse({
        description: 'Cycle metadata with aggregated assessment statistics',
        schema: {
            type: 'object',
            properties: {
                cycle: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', example: 3 },
                        name: { type: 'string', example: 'Assessment Cycle 2026' },
                        year: { type: 'integer', example: 2026 },
                        startsOn: { type: 'string', format: 'date-time', example: '2026-01-01T00:00:00.000Z' },
                        endsOn: { type: 'string', format: 'date-time', example: '2026-12-31T00:00:00.000Z' },
                    },
                },
                rounds: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer', example: 1 },
                            name: { type: 'string', example: 'Round 1' },
                            roundNumber: { type: 'integer', example: 1 },
                        },
                    },
                },
                stats: {
                    type: 'object',
                    properties: {
                        total: { type: 'integer', example: 342 },
                        completed: { type: 'integer', example: 185 },
                        inProgress: { type: 'integer', example: 42 },
                        notStarted: { type: 'integer', example: 110 },
                        absent: { type: 'integer', example: 5 },
                        completionRate: { type: 'integer', description: 'Percentage 0-100', example: 54 },
                    },
                },
            },
        },
    })
    async exportSummary(
        @Query('cycleId') cycleId?: string,
    ) {
        const resolvedCycleId = await this.resolveCycleId(cycleId);

        return this.reportsService.getExportSummary(resolvedCycleId);
    }
}
