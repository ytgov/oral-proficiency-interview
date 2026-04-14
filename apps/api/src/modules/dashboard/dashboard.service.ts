import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getAdminDashboardStats() {
    const activeCycle = await this.prisma.assessmentCycle.findFirst({
      where: { isActive: true },
    });

    if (!activeCycle) {
      return {
        systemOverview: {
          totalStudents: 0,
          completed: 0,
          inProgress: 0,
          notStarted: 0,
          overallProgress: 0,
        },
        schoolsCompletion: [],
        evaluatorWorkload: [],
        recentActivity: [],
      };
    }

    const cycleId = activeCycle.id;

    const [systemOverview, schoolsCompletion, evaluatorWorkload, recentActivity] =
      await Promise.all([
        this.getSystemOverview(cycleId),
        this.getSchoolsCompletion(cycleId),
        this.getEvaluatorWorkload(cycleId),
        this.getRecentActivity(cycleId),
      ]);

    return {
      systemOverview,
      schoolsCompletion,
      evaluatorWorkload,
      recentActivity,
    };
  }

  private async getSystemOverview(cycleId: number) {
    const totalStudents = await this.prisma.student.count({
      where: {
        cycleId,
        isActive: true,
        classStudents: { some: { class: { isIncluded: true } } },
      },
    });

    const assessments = await this.prisma.assessment.groupBy({
      by: ['status'],
      where: {
        cycleId,
        student: {
          classStudents: { some: { class: { isIncluded: true } } },
        },
      },
      _count: { id: true },
    });

    const statusMap = new Map(
      assessments.map((a) => [a.status, a._count.id]),
    );

    const completed = statusMap.get('COMPLETED') ?? 0;
    const inProgress = statusMap.get('IN_PROGRESS') ?? 0;
    const absent = statusMap.get('ABSENT') ?? 0;

    // Students with no assessment record = NOT_STARTED
    const studentsWithAssessment = completed + inProgress + absent +
      (statusMap.get('NOT_STARTED') ?? 0);
    const notStarted = totalStudents - studentsWithAssessment + (statusMap.get('NOT_STARTED') ?? 0);

    const overallProgress =
      totalStudents > 0 ? Math.round((completed / totalStudents) * 100) : 0;

    return {
      totalStudents,
      completed,
      inProgress,
      notStarted: Math.max(0, notStarted),
      overallProgress,
    };
  }

  private async getSchoolsCompletion(cycleId: number) {
    // Get all schools that have students in this cycle
    const schools = await this.prisma.school.findMany({
      where: {
        students: {
          some: { cycleId, isActive: true },
        },
      },
      include: {
        students: {
          where: {
            cycleId,
            isActive: true,
            classStudents: { some: { class: { isIncluded: true } } },
          },
          select: {
            id: true,
            assessments: {
              where: { cycleId },
              select: { status: true },
            },
          },
        },
        classes: {
          where: { cycleId, isIncluded: true },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return schools.map((school) => {
      const totalStudents = school.students.length;
      const completedStudents = school.students.filter((s) =>
        s.assessments.some((a) => a.status === 'COMPLETED'),
      ).length;
      const completion =
        totalStudents > 0
          ? Math.round((completedStudents / totalStudents) * 100)
          : 0;

      // Determine school type from name heuristic
      const schoolType = school.schoolType ||
        (school.name.toLowerCase().includes('secondary') ? 'Secondary' : 'Elementary');

      return {
        name: school.name,
        stats: `${totalStudents} students | ${schoolType}`,
        completion,
      };
    }).sort((a, b) => b.completion - a.completion);
  }

  private async getEvaluatorWorkload(cycleId: number) {
    // Get evaluators who have assignments in this cycle
    const evaluators = await this.prisma.user.findMany({
      where: {
        isActive: true,
        userRoles: {
          some: {
            role: { name: 'EVALUATOR' },
          },
        },
        evaluatorAssignmentsAs: {
          some: { cycleId },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
      },
    });

    const workload = await Promise.all(
      evaluators.map(async (evaluator) => {
        // Get all students assigned to this evaluator through class assignments (only included classes)
        const assignedClasses = await this.prisma.evaluatorAssignment.findMany({
          where: { cycleId, evaluatorId: evaluator.id, class: { isIncluded: true } },
          select: { classId: true },
        });

        const classIds = assignedClasses.map((a) => a.classId);

        // Count total students in assigned classes
        const totalStudents = classIds.length > 0
          ? await this.prisma.classStudent.count({
              where: {
                classId: { in: classIds },
                student: { cycleId, isActive: true },
              },
            })
          : 0;

        // Count completed assessments by this evaluator (only in included classes)
        const completedAssessments = classIds.length > 0
          ? await this.prisma.assessment.count({
              where: {
                cycleId,
                evaluatorId: evaluator.id,
                status: 'COMPLETED',
                student: {
                  classStudents: { some: { classId: { in: classIds } } },
                },
              },
            })
          : 0;

        return {
          name: `${evaluator.firstName} ${evaluator.lastName}`.trim(),
          completed: completedAssessments,
          total: totalStudents,
        };
      }),
    );

    return workload;
  }

  async getVerificationData(filters?: {
    schoolId?: number;
    classId?: number;
    evaluatorId?: number;
    reEval?: string;
    status?: string;
    programId?: number;
  }) {
    const activeCycle = await this.prisma.assessmentCycle.findFirst({
      where: { isActive: true },
    });

    if (!activeCycle) {
      return { stats: { total: 0, completed: 0, inProgress: 0, notStarted: 0 }, assessments: [] };
    }

    const cycleId = activeCycle.id;

    const students = await this.prisma.student.findMany({
      where: {
        cycleId,
        isActive: true,
        classStudents: { some: { class: { isIncluded: true } } },
      },
      include: {
        school: { select: { id: true, name: true } },
        classStudents: {
          where: { class: { isIncluded: true } },
          include: {
            class: {
              include: {
                program: { select: { id: true, name: true } },
                teacher: { select: { id: true, name: true } },
                evaluatorAssignments: {
                  where: { cycleId },
                  include: {
                    evaluator: { select: { id: true, firstName: true, lastName: true } },
                  },
                },
              },
            },
          },
        },
        assessments: {
          where: { cycleId },
          include: {
            evaluator: { select: { id: true, firstName: true, lastName: true } },
            score: { include: { opiLevel: { select: { id: true, description: true } } } },
            auditLogs: {
              where: { action: 'ASSESSMENT_RE_EVALUATE' },
              orderBy: { changedAt: 'desc' },
              take: 1,
              include: {
                changer: { select: { id: true, firstName: true, lastName: true } },
              },
            },
            reviewFlags: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                flagger: { select: { id: true, firstName: true, lastName: true } },
                resolver: { select: { id: true, firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { school: { name: 'asc' } },
        { lastName: 'asc' },
        { firstName: 'asc' },
      ],
    });

    const rows = students.map((student) => {
      const classStudent = student.classStudents[0];
      const cls = classStudent?.class;
      const assessment = student.assessments[0] ?? null;
      const latestReEvalLog = assessment?.auditLogs[0] ?? null;
      const assignedEvaluator = cls?.evaluatorAssignments[0]?.evaluator ?? null;
      const resolvedStatus = assessment?.status ?? 'NOT_STARTED';
      const resolvedEvaluator = assessment?.evaluator ?? assignedEvaluator;

      // Track all class enrollments for filtering
      const allClassIds = student.classStudents.map((cs) => cs.classId);

      return {
        id: assessment?.id ?? null,
        studentId: student.id,
        schoolId: student.schoolId,
        classId: classStudent?.classId ?? null,
        allClassIds,
        evaluatorId: resolvedEvaluator?.id ?? null,
        programId: cls?.program?.id ?? null,
        studentName: `${student.firstName} ${student.lastName}`.trim(),
        school: student.school?.name ?? null,
        classCode: cls?.classCode ?? null,
        teacher: cls?.teacher?.name ?? null,
        program: cls?.program?.name ?? null,
        status: resolvedStatus,
        score: assessment?.score?.opiLevel?.id ?? null,
        reEval: latestReEvalLog !== null,
        evaluator: resolvedEvaluator
          ? `${resolvedEvaluator.firstName} ${resolvedEvaluator.lastName}`.trim()
          : null,
        completedDate: assessment?.completedAt ? assessment.completedAt.toISOString() : null,
        startDate: assessment?.startedAt ? assessment.startedAt.toISOString() : null,
        lastReEvalDate: latestReEvalLog?.changedAt ? latestReEvalLog.changedAt.toISOString() : null,
        lastReEvalBy: latestReEvalLog?.changer
          ? `${latestReEvalLog.changer.firstName} ${latestReEvalLog.changer.lastName}`.trim()
          : null,
      };
    });

    const filtered = rows.filter((row) => {
      if (filters?.status && filters.status !== 'ALL' && row.status !== filters.status) return false;
      if (filters?.evaluatorId && row.evaluatorId !== filters.evaluatorId) return false;
      if (filters?.schoolId && row.schoolId !== filters.schoolId) return false;
      if (filters?.classId && !row.allClassIds.includes(filters.classId)) return false;
      if (filters?.programId && row.programId !== filters.programId) return false;
      if (filters?.reEval === 'YES' && !row.reEval) return false;
      if (filters?.reEval === 'NO' && row.reEval) return false;
      return true;
    });

    const stats = {
      total: filtered.length,
      completed: filtered.filter((row) => row.status === 'COMPLETED').length,
      inProgress: filtered.filter((row) => row.status === 'IN_PROGRESS').length,
      notStarted: filtered.filter((row) => row.status === 'NOT_STARTED').length,
    };

    // Build filter options from all enrollments (not just the primary class)
    const schoolMap = new Map<number, string>();
    const classMap = new Map<number, string>();
    const evaluatorMap = new Map<number, string>();
    const programMap = new Map<number, string>();

    for (const student of students) {
      if (student.schoolId && student.school?.name) {
        schoolMap.set(student.schoolId, student.school.name);
      }
      for (const cs of student.classStudents) {
        classMap.set(cs.classId, cs.class.classCode);
        if (cs.class.program) {
          programMap.set(cs.class.program.id, cs.class.program.name);
        }
      }
    }
    for (const row of rows) {
      if (row.evaluatorId && row.evaluator) {
        evaluatorMap.set(row.evaluatorId, row.evaluator);
      }
    }

    return {
      stats,
      assessments: filtered.map(({ allClassIds: _, ...row }) => row),
      filterOptions: {
        schools: [...schoolMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        classes: [...classMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        evaluators: [...evaluatorMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        programs: [...programMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    };
  }

  private async getRecentActivity(cycleId: number) {
    // Get recently completed/scored assessments
    const recentAssessments = await this.prisma.assessment.findMany({
      where: {
        cycleId,
        status: { in: ['COMPLETED', 'IN_PROGRESS'] },
      },
      include: {
        student: {
          include: {
            school: {
              select: { name: true },
            },
          },
        },
        score: {
          select: {
            opiLevelId: true,
          },
        },
      },
      orderBy: { lastModifiedAt: 'desc' },
      take: 10,
    });

    return recentAssessments.map((assessment) => {
      const scoreText = assessment.score
        ? `Score: ${assessment.score.opiLevelId}`
        : 'Score: no-data';

      const date = assessment.completedAt || assessment.lastModifiedAt;
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

      return {
        id: assessment.id,
        name: `${assessment.student.firstName} ${assessment.student.lastName}`.trim(),
        school: assessment.student.school.name,
        timestamp: `${scoreText} | ${dateStr}`,
      };
    });
  }
}
