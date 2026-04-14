import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ExportFilter {
    cycleId: number;
    roundId?: number;
}

export interface ExportRow {
    student_number: string;
    opi_level: number | null;
    opi_level_description: string | null;
    status: string;
    completed_at: string | null;
}

export interface AuditEntry {
    action: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    changed_by: {
        id: number;
        first_name: string;
        last_name: string;
        email: string;
    } | null;
    changed_at: string;
}

export interface ProgressRow {
    student_number: string;
    first_name: string;
    last_name: string;
    grade: number | null;
    school_name: string;
    school_code: string;
    class_code: string;
    program_name: string | null;
    evaluator_name: string | null;
    status: string;
    opi_level: number | null;
    opi_level_description: string | null;
    started_at: string | null;
    completed_at: string | null;
    has_audio: boolean;
    needs_review: boolean;
    audit_history: AuditEntry[];
}

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    /**
     * M2M export: minimal fields only (student_number, opi_level, status).
     * Excludes names, schools, notes, and audio per spec.
     */
    async getExportData(filter: ExportFilter): Promise<ExportRow[]> {
        const cycle = await this.prisma.assessmentCycle.findUnique({
            where: { id: filter.cycleId },
        });

        if (!cycle) {
            throw new NotFoundException('Cycle not found');
        }

        const where: Record<string, unknown> = {
            cycleId: filter.cycleId,
        };

        if (filter.roundId) {
            where.roundId = filter.roundId;
        }

        const assessments = await this.prisma.assessment.findMany({
            where,
            include: {
                student: {
                    select: {
                        studentNumber: true,
                    },
                },
                score: {
                    include: {
                        opiLevel: true,
                    },
                },
            },
            orderBy: { id: 'asc' },
        });

        return assessments.map((a) => ({
            student_number: a.student.studentNumber,
            opi_level: a.score?.opiLevelId ?? null,
            opi_level_description: a.score?.opiLevel?.description ?? null,
            status: a.status,
            completed_at: a.completedAt?.toISOString() ?? null,
        }));
    }

    /**
     * Coordinator progress report: includes student details, school, class,
     * evaluator, and assessment status for CSV download.
     */
    async getProgressReport(filter: ExportFilter): Promise<ProgressRow[]> {
        const cycle = await this.prisma.assessmentCycle.findUnique({
            where: { id: filter.cycleId },
        });

        if (!cycle) {
            throw new NotFoundException('Cycle not found');
        }

        const where: Record<string, unknown> = {
            cycleId: filter.cycleId,
        };

        if (filter.roundId) {
            where.roundId = filter.roundId;
        }

        const assessments = await this.prisma.assessment.findMany({
            where,
            include: {
                student: {
                    include: {
                        school: {
                            select: {
                                name: true,
                                schoolCode: true,
                            },
                        },
                        classStudents: {
                            include: {
                                class: {
                                    select: {
                                        classCode: true,
                                        program: {
                                            select: { name: true },
                                        },
                                    },
                                },
                            },
                            take: 1,
                        },
                    },
                },
                evaluator: {
                    select: {
                        firstName: true,
                        lastName: true,
                    },
                },
                score: {
                    include: {
                        opiLevel: true,
                    },
                },
                audioRecordings: {
                    select: { id: true },
                    take: 1,
                },
                auditLogs: {
                    include: {
                        changer: {
                            select: {
                                id: true,
                                firstName: true,
                                lastName: true,
                                email: true,
                            },
                        },
                    },
                    orderBy: { changedAt: 'desc' },
                },
            },
            orderBy: [
                { student: { school: { name: 'asc' } } },
                { student: { lastName: 'asc' } },
                { student: { firstName: 'asc' } },
            ],
        });

        return assessments.map((a) => {
            const classStudent = a.student.classStudents[0];
            return {
                student_number: a.student.studentNumber,
                first_name: a.student.firstName,
                last_name: a.student.lastName,
                grade: a.student.grade,
                school_name: a.student.school.name,
                school_code: a.student.school.schoolCode,
                class_code: classStudent?.class?.classCode ?? '',
                program_name: classStudent?.class?.program?.name ?? null,
                evaluator_name: a.evaluator
                    ? `${a.evaluator.firstName} ${a.evaluator.lastName}`
                    : null,
                status: a.status,
                opi_level: a.score?.opiLevelId ?? null,
                opi_level_description: a.score?.opiLevel?.description ?? null,
                started_at: a.startedAt?.toISOString() ?? null,
                completed_at: a.completedAt?.toISOString() ?? null,
                has_audio: a.audioRecordings.length > 0,
                needs_review: a.needsReview,
                audit_history: a.auditLogs.map((log) => ({
                    action: log.action,
                    field_name: log.fieldName,
                    old_value: log.oldValue,
                    new_value: log.newValue,
                    changed_by: log.changer
                        ? {
                            id: log.changer.id,
                            first_name: log.changer.firstName,
                            last_name: log.changer.lastName,
                            email: log.changer.email,
                        }
                        : null,
                    changed_at: log.changedAt.toISOString(),
                })),
            };
        });
    }

    /**
     * Convert an array of objects to CSV string.
     */
    toCsv<T extends Record<string, unknown>>(rows: T[]): string {
        if (rows.length === 0) return '';

        const headers = Object.keys(rows[0]);
        const csvLines = [
            headers.join(','),
            ...rows.map((row) =>
                headers
                    .map((h) => {
                        const val = row[h];
                        if (val === null || val === undefined) return '';
                        const str = String(val);
                        // Escape CSV values containing commas, quotes, or newlines
                        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    })
                    .join(','),
            ),
        ];

        return csvLines.join('\n');
    }

    /**
     * Get summary statistics for a cycle (used in admin export page).
     */
    async getExportSummary(cycleId: number) {
        const cycle = await this.prisma.assessmentCycle.findUnique({
            where: { id: cycleId },
            include: {
                rounds: { orderBy: { roundNumber: 'asc' } },
            },
        });

        if (!cycle) {
            throw new NotFoundException('Cycle not found');
        }

        const includedClassFilter = {
            student: { classStudents: { some: { class: { isIncluded: true } } } },
        };
        const [total, completed, inProgress, notStarted, absent] = await Promise.all([
            this.prisma.assessment.count({ where: { cycleId, ...includedClassFilter } }),
            this.prisma.assessment.count({ where: { cycleId, status: 'COMPLETED', ...includedClassFilter } }),
            this.prisma.assessment.count({ where: { cycleId, status: 'IN_PROGRESS', ...includedClassFilter } }),
            this.prisma.assessment.count({ where: { cycleId, status: 'NOT_STARTED', ...includedClassFilter } }),
            this.prisma.assessment.count({ where: { cycleId, status: 'ABSENT', ...includedClassFilter } }),
        ]);

        return {
            cycle: {
                id: cycle.id,
                name: cycle.name,
                year: cycle.year,
                startsOn: cycle.startsOn,
                endsOn: cycle.endsOn,
            },
            rounds: cycle.rounds.map((r) => ({
                id: r.id,
                name: r.name,
                roundNumber: r.roundNumber,
            })),
            stats: {
                total,
                completed,
                inProgress,
                notStarted,
                absent,
                completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
            },
        };
    }
}
