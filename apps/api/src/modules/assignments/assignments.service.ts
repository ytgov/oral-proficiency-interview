import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CyclesService } from '../cycles/cycles.service';
import { AuditService } from '../audit/audit.service';
import {
  BulkCreateAssignmentsDto,
  CreateAssignmentDto,
  QueryAssignmentsDto,
} from './dto/assignments.dto';

@Injectable()
export class AssignmentsService {
  constructor(
    private prisma: PrismaService,
    private cyclesService: CyclesService,
    private auditService: AuditService,
  ) {}

  async createAssignment(dto: CreateAssignmentDto, assignedByUserId: number) {
    await this.assertActiveApprovedCycle(dto.cycleId);

    const classEntity = await this.prisma.class.findUnique({
      where: { id: dto.classId },
    });

    if (!classEntity) {
      throw new NotFoundException('Class not found');
    }

    if (classEntity.cycleId !== dto.cycleId) {
      throw new BadRequestException('Class does not belong to the specified cycle');
    }

    if (!classEntity.isIncluded) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Cannot assign evaluator to an excluded class',
        error: 'CLASS_NOT_INCLUDED',
      });
    }

    await this.assertEvaluatorRole(dto.evaluatorId);

    const existing = await this.prisma.evaluatorAssignment.findUnique({
      where: {
        cycleId_classId_evaluatorId: {
          cycleId: dto.cycleId,
          classId: dto.classId,
          evaluatorId: dto.evaluatorId,
        },
      },
    });

    if (existing) {
      throw new ConflictException({
        statusCode: 409,
        message: 'Assignment already exists',
        error: 'CONFLICT_DUPLICATE',
      });
    }

    const result = await this.prisma.evaluatorAssignment.create({
      data: {
        cycleId: dto.cycleId,
        classId: dto.classId,
        evaluatorId: dto.evaluatorId,
        assignedBy: assignedByUserId,
      },
      include: {
        class: {
          include: {
            school: true,
          },
        },
        evaluator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assigner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    await this.auditService.logSystemEvent('EVALUATOR_ASSIGN', assignedByUserId, {
      cycleId: dto.cycleId,
      classId: dto.classId,
      evaluatorId: dto.evaluatorId,
      evaluatorName: `${result.evaluator.firstName} ${result.evaluator.lastName}`.trim(),
      schoolName: result.class.school.name,
    });

    return result;
  }

  async createBulkAssignments(dto: BulkCreateAssignmentsDto, assignedByUserId: number) {
    await this.assertActiveApprovedCycle(dto.cycleId);

    const uniquePayload = new Map<string, { classId: number; evaluatorId: number }>();

    for (const assignment of dto.assignments) {
      const key = `${assignment.classId}:${assignment.evaluatorId}`;
      if (!uniquePayload.has(key)) {
        uniquePayload.set(key, assignment);
      }
    }

    const assignments = Array.from(uniquePayload.values());
    const classIds = [...new Set(assignments.map((a) => a.classId))];
    const evaluatorIds = [...new Set(assignments.map((a) => a.evaluatorId))];

    const [classes, evaluators, existingAssignments] = await Promise.all([
      this.prisma.class.findMany({
        where: { id: { in: classIds } },
        select: { id: true, cycleId: true, isIncluded: true },
      }),
      this.prisma.user.findMany({
        where: { id: { in: evaluatorIds } },
        include: {
          userRoles: {
            include: {
              role: true,
            },
          },
        },
      }),
      this.prisma.evaluatorAssignment.findMany({
        where: {
          cycleId: dto.cycleId,
          classId: { in: classIds },
          evaluatorId: { in: evaluatorIds },
        },
        select: {
          classId: true,
          evaluatorId: true,
        },
      }),
    ]);

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const evaluatorMap = new Map(
      evaluators.map((e) => [
        e.id,
        {
          exists: true,
          hasEvaluatorRole: e.userRoles.some((ur) => ur.role.name === 'EVALUATOR'),
        },
      ]),
    );
    const existingKeySet = new Set(
      existingAssignments.map((a) => `${a.classId}:${a.evaluatorId}`),
    );

    const errors: Array<{ classId: number; evaluatorId: number; error: string }> = [];
    const rowsToCreate: Array<{
      cycleId: number;
      classId: number;
      evaluatorId: number;
      assignedBy: number;
    }> = [];
    let skippedDuplicates = 0;

    for (const assignment of assignments) {
      const classEntity = classMap.get(assignment.classId);
      if (!classEntity) {
        errors.push({
          classId: assignment.classId,
          evaluatorId: assignment.evaluatorId,
          error: 'CLASS_NOT_FOUND',
        });
        continue;
      }

      if (classEntity.cycleId !== dto.cycleId) {
        errors.push({
          classId: assignment.classId,
          evaluatorId: assignment.evaluatorId,
          error: 'CLASS_NOT_IN_CYCLE',
        });
        continue;
      }

      if (!classEntity.isIncluded) {
        errors.push({
          classId: assignment.classId,
          evaluatorId: assignment.evaluatorId,
          error: 'CLASS_NOT_INCLUDED',
        });
        continue;
      }

      const evaluator = evaluatorMap.get(assignment.evaluatorId);
      if (!evaluator?.exists) {
        errors.push({
          classId: assignment.classId,
          evaluatorId: assignment.evaluatorId,
          error: 'EVALUATOR_NOT_FOUND',
        });
        continue;
      }

      if (!evaluator.hasEvaluatorRole) {
        errors.push({
          classId: assignment.classId,
          evaluatorId: assignment.evaluatorId,
          error: 'NOT_EVALUATOR',
        });
        continue;
      }

      const pairKey = `${assignment.classId}:${assignment.evaluatorId}`;
      if (existingKeySet.has(pairKey)) {
        skippedDuplicates++;
        continue;
      }

      existingKeySet.add(pairKey);
      rowsToCreate.push({
        cycleId: dto.cycleId,
        classId: assignment.classId,
        evaluatorId: assignment.evaluatorId,
        assignedBy: assignedByUserId,
      });
    }

    if (rowsToCreate.length > 0) {
      await this.prisma.evaluatorAssignment.createMany({
        data: rowsToCreate,
      });

      await this.auditService.logSystemEvent('EVALUATOR_BULK_ASSIGN', assignedByUserId, {
        cycleId: dto.cycleId,
        recordsCreated: rowsToCreate.length,
        recordsSkipped: skippedDuplicates,
        recordsFailed: errors.length,
        assignments: rowsToCreate.map((r) => ({
          classId: r.classId,
          evaluatorId: r.evaluatorId,
        })),
      });
    }

    return {
      recordsTotal: dto.assignments.length,
      recordsProcessed: assignments.length,
      recordsCreated: rowsToCreate.length,
      recordsSkipped: skippedDuplicates,
      recordsFailed: errors.length,
      errors,
    };
  }

  async findAssignments(query: QueryAssignmentsDto) {
    const where: Record<string, unknown> = {};

    if (query.cycleId) {
      where.cycleId = query.cycleId;
    }
    if (query.classId) {
      where.classId = query.classId;
    }
    if (query.evaluatorId) {
      where.evaluatorId = query.evaluatorId;
    }

    return this.prisma.evaluatorAssignment.findMany({
      where,
      include: {
        class: {
          include: {
            school: true,
            program: true,
          },
        },
        evaluator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assigner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [
        { class: { school: { name: 'asc' } } },
        { class: { classCode: 'asc' } },
      ],
    });
  }

  async deleteAssignment(id: number, deletedByUserId: number) {
    const assignment = await this.prisma.evaluatorAssignment.findUnique({
      where: { id },
      include: {
        evaluator: { select: { firstName: true, lastName: true } },
        class: { include: { school: { select: { name: true } } } },
      },
    });

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.prisma.evaluatorAssignment.delete({
      where: { id },
    });

    await this.auditService.logSystemEvent('EVALUATOR_UNASSIGN', deletedByUserId, {
      cycleId: assignment.cycleId,
      classId: assignment.classId,
      evaluatorId: assignment.evaluatorId,
      evaluatorName: `${assignment.evaluator.firstName} ${assignment.evaluator.lastName}`.trim(),
      schoolName: assignment.class.school.name,
    });

    return { success: true, deletedId: id };
  }

  async getAssignmentManagement(cycleId?: number, schoolId?: number) {
    const cycle = await this.cyclesService.checkCycleApproval();
    const targetCycleId = cycleId ?? cycle.id;

    // Get all included classes with full details
    const classWhere: Record<string, unknown> = {
      cycleId: targetCycleId,
      isIncluded: true,
    };
    if (schoolId) {
      classWhere.schoolId = schoolId;
    }

    const classes = await this.prisma.class.findMany({
      where: classWhere,
      include: {
        school: {
          select: { id: true, schoolCode: true, name: true, schoolType: true },
        },
        program: {
          select: { id: true, name: true },
        },
        teacher: {
          select: { id: true, name: true },
        },
        classStudents: {
          select: {
            studentId: true,
            student: {
              select: {
                id: true,
                assessments: {
                  where: { cycleId: targetCycleId },
                  select: { status: true },
                },
              },
            },
          },
        },
        evaluatorAssignments: {
          where: { cycleId: targetCycleId },
          select: {
            id: true,
            evaluatorId: true,
            evaluator: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
      orderBy: [{ school: { name: 'asc' } }, { classCode: 'asc' }],
    });

    // Get school assessment dates
    const schoolIds = [...new Set(classes.map((c) => c.schoolId))];
    const schoolDates = await this.prisma.schoolAssessmentDate.findMany({
      where: {
        cycleId: targetCycleId,
        schoolId: { in: schoolIds },
      },
      select: {
        schoolId: true,
        assessmentDate: true,
      },
      orderBy: { assessmentDate: 'asc' },
    });

    const datesBySchool = new Map<number, string[]>();
    for (const sd of schoolDates) {
      const arr = datesBySchool.get(sd.schoolId) ?? [];
      arr.push(sd.assessmentDate.toISOString().slice(0, 10));
      datesBySchool.set(sd.schoolId, arr);
    }

    // Build enriched class rows
    const classRows = classes.map((cls) => {
      const totalStudents = cls.classStudents.length;
      const completedStudents = cls.classStudents.filter((cs) =>
        cs.student.assessments.some((a) => a.status === 'COMPLETED'),
      ).length;
      const inProgressStudents = cls.classStudents.filter((cs) =>
        cs.student.assessments.some((a) => a.status === 'IN_PROGRESS'),
      ).length;
      const progress = totalStudents > 0 ? Math.round((completedStudents / totalStudents) * 100) : 0;

      const evaluators = cls.evaluatorAssignments.map((ea) => ({
        id: ea.evaluator.id,
        name: `${ea.evaluator.firstName} ${ea.evaluator.lastName}`.trim(),
        email: ea.evaluator.email,
        assignmentId: ea.id,
      }));

      const schoolType = cls.school.schoolType ??
        (cls.school.name.toLowerCase().includes('secondary') ? 'Secondary' : 'Elementary');

      const dates = datesBySchool.get(cls.schoolId) ?? [];

      return {
        id: cls.id,
        classCode: cls.classCode,
        grade: cls.grade,
        school: {
          id: cls.school.id,
          schoolCode: cls.school.schoolCode,
          name: cls.school.name,
          schoolType,
        },
        teacher: cls.teacher ? cls.teacher.name : null,
        program: cls.program ? cls.program.name : null,
        totalStudents,
        completedStudents,
        inProgressStudents,
        progress,
        assessmentDates: dates,
        assessmentDate: dates[0] ?? null,
        evaluators,
        isAssigned: evaluators.length > 0,
      };
    });

    // Stats
    const unassignedClasses = classRows.filter((c) => !c.isAssigned).length;
    const assignedClasses = classRows.filter((c) => c.isAssigned && c.progress < 100).length;
    const inProgressClasses = classRows.filter((c) => c.isAssigned && c.progress > 0 && c.progress < 100).length;
    const completedClasses = classRows.filter((c) => c.progress === 100).length;

    // Evaluator workload cards
    const evaluators = await this.getEvaluators();
    const evaluatorWorkload = await Promise.all(
      evaluators.map(async (ev) => {
        const evAssignments = await this.prisma.evaluatorAssignment.findMany({
          where: { cycleId: targetCycleId, evaluatorId: ev.id, class: { isIncluded: true } },
          select: {
            classId: true,
          },
        });
        const evClassIds = evAssignments.map((a) => a.classId);
        const studentCount = evClassIds.length > 0
          ? await this.prisma.classStudent.count({
              where: {
                classId: { in: evClassIds },
                student: { cycleId: targetCycleId, isActive: true },
              },
            })
          : 0;
        const completedCount = evClassIds.length > 0
          ? await this.prisma.assessment.count({
              where: {
                cycleId: targetCycleId,
                evaluatorId: ev.id,
                status: 'COMPLETED',
                student: {
                  classStudents: { some: { classId: { in: evClassIds } } },
                },
              },
            })
          : 0;
        const progress = studentCount > 0 ? Math.round((completedCount / studentCount) * 100) : 0;

        return {
          id: ev.id,
          firstName: ev.firstName,
          lastName: ev.lastName,
          email: ev.email,
          classCount: evAssignments.length,
          studentCount,
          completedCount,
          progress,
        };
      }),
    );

    // Schools for filter dropdown
    const schoolsForFilter = [...new Map(
      classRows.map((c) => [c.school.id, { id: c.school.id, name: c.school.name }]),
    ).values()].sort((a, b) => a.name.localeCompare(b.name));

    return {
      cycle: { id: cycle.id, name: cycle.name },
      stats: {
        unassignedClasses,
        assignedClasses,
        inProgressClasses,
        completedClasses,
        totalClasses: classRows.length,
      },
      evaluatorWorkload,
      schools: schoolsForFilter,
      classes: classRows,
    };
  }

  async getEvaluatorWorkloadCounts(cycleId: number) {
    await this.assertActiveApprovedCycle(cycleId);

    const assignments = await this.prisma.evaluatorAssignment.groupBy({
      by: ['evaluatorId'],
      where: { cycleId },
      _count: {
        classId: true,
      },
    });

    return assignments.map((a) => ({
      evaluatorId: a.evaluatorId,
      classCount: a._count.classId,
    }));
  }

  async getEvaluators() {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            role: {
              name: 'EVALUATOR',
            },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async getAssignableClasses(cycleId?: number) {
    const cycle = await this.cyclesService.checkCycleApproval();

    if (cycleId && cycle.id !== cycleId) {
      throw new BadRequestException('Classes can only be queried for the active approved cycle');
    }

    return this.prisma.class.findMany({
      where: {
        cycleId: cycle.id,
        isIncluded: true,
      },
      include: {
        school: {
          select: {
            id: true,
            schoolCode: true,
            name: true,
          },
        },
        program: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ school: { name: 'asc' } }, { classCode: 'asc' }],
    });
  }

  private async assertActiveApprovedCycle(cycleId: number) {
    const cycle = await this.cyclesService.checkCycleApproval();

    if (cycle.id !== cycleId) {
      throw new BadRequestException('Operation must target the active cycle');
    }

    return cycle;
  }

  private async assertEvaluatorRole(evaluatorId: number) {
    const evaluator = await this.prisma.user.findUnique({
      where: { id: evaluatorId },
      include: {
        userRoles: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!evaluator) {
      throw new NotFoundException('Evaluator not found');
    }

    const hasEvaluatorRole = evaluator.userRoles.some((ur) => ur.role.name === 'EVALUATOR');
    if (!hasEvaluatorRole) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'User does not have EVALUATOR role',
        error: 'NOT_EVALUATOR',
      });
    }
  }
}
