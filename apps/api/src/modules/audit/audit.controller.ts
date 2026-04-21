import {
    Controller,
    Get,
    Param,
    Query,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { AuditService, AuditAction } from './audit.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Scopes } from '../../common/decorators/scopes.decorator';

@ApiTags('Audit')
@ApiBearerAuth('access-token')
@Controller('audit')
export class AuditController {
    constructor(private readonly auditService: AuditService) { }

    /**
     * GET /audit/assessments/:id
     * Get the audit timeline for a specific assessment.
     * Accessible by EVALUATOR (own assessments), COORDINATOR, ADMIN.
     */
    @Get('assessments/:id')
    @Scopes('audit:read')
    @Roles('EVALUATOR', 'COORDINATOR', 'ADMIN')
    @ApiOperation({ summary: 'Get the full change history timeline for a specific assessment' })
    @ApiParam({ name: 'id', type: 'integer', description: 'Assessment ID', example: 42 })
    @ApiOkResponse({
        description: 'Assessment audit timeline',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    id: { type: 'integer', example: 101 },
                    assessmentId: { type: 'integer', example: 42 },
                    action: { type: 'string', example: 'ASSESSMENT_COMPLETE' },
                    fieldName: { type: 'string', nullable: true, example: 'status' },
                    oldValue: { type: 'string', nullable: true, example: 'IN_PROGRESS' },
                    newValue: { type: 'string', nullable: true, example: 'COMPLETED' },
                    changedAt: { type: 'string', format: 'date-time', example: '2026-04-10T14:22:00.000Z' },
                    changer: {
                        type: 'object',
                        nullable: true,
                        properties: {
                            id: { type: 'integer', example: 7 },
                            firstName: { type: 'string', example: 'Marie' },
                            lastName: { type: 'string', example: 'Dupont' },
                            email: { type: 'string', example: 'marie.dupont@test.com' },
                        },
                    },
                },
            },
        },
    })
    async getAssessmentTimeline(
        @Param('id', ParseIntPipe) assessmentId: number,
    ) {
        return this.auditService.getAssessmentAuditLogs(assessmentId);
    }

    /**
     * GET /audit/logs
     * Get paginated, filtered audit logs (admin view).
     * Supports filters: assessmentId, action, changedBy, dateFrom, dateTo, page, limit.
     */
    @Get('logs')
    @Scopes('audit:read')
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Query paginated audit logs with filters (by assessment, action type, user, date range)' })
    @ApiQuery({ name: 'assessmentId', required: false, type: 'integer', description: 'Filter by assessment ID', example: 42 })
    @ApiQuery({
        name: 'action', required: false, type: 'string', description: 'Filter by action type',
        enum: [
            'ASSIGNMENT_CREATE', 'ASSIGNMENT_DELETE',
            'ASSESSMENT_START', 'ASSESSMENT_COMPLETE', 'ASSESSMENT_REOPEN', 'ASSESSMENT_UPDATE',
            'ASSESSMENT_MARK_ABSENT', 'ASSESSMENT_RESET_ABSENT', 'ASSESSMENT_AUDIO_UPLOADED',
            'CLASS_SUBMITTED', 'ASSESSMENT_LOCKED', 'ASSESSMENT_FLAGGED_FOR_REVIEW',
            'ASSESSMENT_RE_EVALUATE', 'SCORE_CHANGE', 'REVIEW_RESOLVED',
        ],
    })
    @ApiQuery({ name: 'changedBy', required: false, type: 'integer', description: 'Filter by user ID who made the change', example: 7 })
    @ApiQuery({ name: 'dateFrom', required: false, type: 'string', description: 'Filter from date (ISO string)', example: '2026-04-01T00:00:00.000Z' })
    @ApiQuery({ name: 'dateTo', required: false, type: 'string', description: 'Filter to date (ISO string)', example: '2026-04-30T23:59:59.000Z' })
    @ApiQuery({ name: 'page', required: false, type: 'integer', description: 'Page number (default: 1)', example: 1 })
    @ApiQuery({ name: 'limit', required: false, type: 'integer', description: 'Items per page (default: 25)', example: 25 })
    @ApiOkResponse({
        description: 'Paginated audit logs with metadata',
        schema: {
            type: 'object',
            properties: {
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer', example: 101 },
                            assessmentId: { type: 'integer', example: 42 },
                            action: { type: 'string', example: 'SCORE_CHANGE' },
                            fieldName: { type: 'string', nullable: true, example: 'opiLevelId' },
                            oldValue: { type: 'string', nullable: true, example: '3' },
                            newValue: { type: 'string', nullable: true, example: '4' },
                            changedAt: { type: 'string', format: 'date-time', example: '2026-04-10T14:22:00.000Z' },
                            changer: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', example: 7 },
                                    firstName: { type: 'string', example: 'Marie' },
                                    lastName: { type: 'string', example: 'Dupont' },
                                    email: { type: 'string', example: 'marie.dupont@test.com' },
                                },
                            },
                            assessment: {
                                type: 'object',
                                properties: {
                                    id: { type: 'integer', example: 42 },
                                    status: { type: 'string', example: 'COMPLETED' },
                                    student: {
                                        type: 'object',
                                        properties: {
                                            id: { type: 'integer', example: 120 },
                                            firstName: { type: 'string', example: 'Khaleesi' },
                                            lastName: { type: 'string', example: 'Manning' },
                                            studentNumber: { type: 'string', example: '1279128' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                meta: {
                    type: 'object',
                    properties: {
                        total: { type: 'integer', example: 156 },
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 25 },
                        totalPages: { type: 'integer', example: 7 },
                    },
                },
            },
        },
    })
    async getAuditLogs(
        @Query('assessmentId') assessmentId?: string,
        @Query('action') action?: string,
        @Query('changedBy') changedBy?: string,
        @Query('dateFrom') dateFrom?: string,
        @Query('dateTo') dateTo?: string,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        return this.auditService.getFilteredAuditLogs({
            assessmentId: assessmentId ? parseInt(assessmentId, 10) : undefined,
            action: action ? (action as AuditAction) : undefined,
            changedBy: changedBy ? parseInt(changedBy, 10) : undefined,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
            page: page ? parseInt(page, 10) : undefined,
            limit: limit ? parseInt(limit, 10) : undefined,
        });
    }

    /**
     * GET /audit/actions
     * Get distinct action types for filter dropdowns.
     */
    @Get('actions')
    @Scopes('audit:read')
    @Roles('ADMIN', 'COORDINATOR')
    @ApiOperation({ summary: 'Get the list of distinct audit action types (for filter dropdowns)' })
    @ApiOkResponse({
        description: 'Array of action type strings',
        schema: {
            type: 'array',
            items: { type: 'string' },
            example: ['ASSESSMENT_COMPLETE', 'ASSESSMENT_START', 'SCORE_CHANGE', 'ASSESSMENT_RE_EVALUATE'],
        },
    })
    async getDistinctActions() {
        return this.auditService.getDistinctActions();
    }

    /**
     * GET /audit/system
     * Full system audit history: purges, manual edits, and ingestion logs.
     */
    @Get('system')
    @Scopes('audit:read')
    @Roles('ADMIN')
    @ApiOperation({ summary: 'Get the full system audit history (purges, manual edits, ingestion) sorted by date' })
    @ApiOkResponse({
        description: 'Unified audit history from system events, manual edits, and ingestion logs',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    source: { type: 'string', enum: ['SYSTEM', 'MANUAL_EDIT', 'INGESTION'], example: 'SYSTEM' },
                    id: { type: 'integer', example: 1 },
                    action: { type: 'string', example: 'CYCLE_RESET' },
                    date: { type: 'string', format: 'date-time', example: '2026-04-05T10:00:00.000Z' },
                    user: {
                        type: 'object',
                        nullable: true,
                        properties: {
                            id: { type: 'integer', example: 1 },
                            firstName: { type: 'string', example: 'Admin' },
                            lastName: { type: 'string', example: 'User' },
                            email: { type: 'string', example: 'admin@test.com' },
                        },
                    },
                    details: {
                        type: 'object',
                        description: 'Shape varies by source type',
                        example: {
                            cycleId: 2,
                            cycleName: 'Assessment Cycle 2025',
                            cycleYear: 2025,
                            purgedAssessments: 320,
                            purgedStudents: 310,
                            purgedAudioFiles: 280,
                        },
                    },
                },
            },
        },
    })
    async getSystemAuditHistory() {
        return this.auditService.getSystemAuditHistory();
    }
}
