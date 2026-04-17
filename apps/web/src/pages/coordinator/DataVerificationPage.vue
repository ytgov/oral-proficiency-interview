<template>
  <AppShell :user="currentUser">
    <CoordinatorSubNav />

    <div class="mt-8 mb-6">
      <h1 class="text-3xl font-bold text-neutral-900 mb-1">Data Verification</h1>
      <p class="text-neutral-600">Review and verify OPI assessment data for accuracy and completeness.</p>
    </div>

    <!-- Stats Cards -->
    <section class="mb-6">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard :value="stats.total" label="Total Assessments" variant="default" />
        <StatCard :value="stats.completed" label="Completed" variant="green" />
        <StatCard :value="stats.inProgress" label="In Progress" variant="yellow" />
        <StatCard :value="stats.notStarted" label="Not Started" variant="red" />
      </div>
    </section>

    <!-- Filters Card -->
    <BaseCard class="mb-6">
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <AppAutocomplete
          v-model="filters.schoolId"
          :options="schoolOptions"
          label="School"
          placeholder="Search schools..."
          @update:model-value="applyFilters"
        />

        <!-- <AppAutocomplete
          v-model="filters.classId"
          :options="classOptions"
          label="Class"
          placeholder="Search classes..."
          @update:model-value="applyFilters"
        /> -->

        <AppAutocomplete
          v-model="filters.evaluatorId"
          :options="evaluatorOptions"
          label="Evaluator"
          placeholder="Search evaluators..."
          @update:model-value="applyFilters"
        />

        <AppAutocomplete
          v-model="filters.reEval"
          :options="reEvalOptions"
          label="Re-evaluation"
          placeholder="All"
          @update:model-value="applyFilters"
        />

        <AppAutocomplete
          v-model="filters.status"
          :options="statusOptions"
          label="Status"
          placeholder="All statuses..."
          @update:model-value="applyFilters"
        />

        <!-- <AppAutocomplete
          v-model="filters.programId"
          :options="programOptions"
          label="Program"
          placeholder="Search programs..."
          @update:model-value="applyFilters"
        /> -->
      </div>

      <p class="mt-3 text-xs text-neutral-500">
        Showing {{ assessments.length }} assessments
      </p>
    </BaseCard>

    <!-- Loading / Error -->
    <LoadingState v-if="isLoading" />
    <NoCycleNotice v-else-if="noCycle" />
    <ErrorState v-else-if="error" :message="error" @retry="fetchData" />

    <!-- Table -->
    <BaseCard v-else>
      <AppDataTable
        :data="assessments"
        :columns="columns"
        search-placeholder="Search by student name, school, evaluator..."
        empty-text="No assessments found matching the current filters."
        :initial-page-size="20"
      >
        <template #cell-studentName="{ row }">
          <span class="font-medium text-neutral-900">{{ asRow(row).studentName }}</span>
        </template>

        <template #cell-school="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).school ?? '-' }}</span>
        </template>

        <template #cell-classCode="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).classCode ?? '-' }}</span>
        </template>

        <template #cell-teacher="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).teacher ?? '-' }}</span>
        </template>

        <template #cell-program="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).program ?? '-' }}</span>
        </template>

        <template #cell-status="{ row }">
          <span
            class="inline-block px-2 py-0.5 text-xs font-semibold rounded border"
            :class="statusBadgeClass(asRow(row).status)"
          >
            {{ statusLabel(asRow(row).status) }}
          </span>
        </template>

        <template #cell-score="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).score ?? '-' }}</span>
        </template>

        <template #cell-reEval="{ row }">
          <span
            v-if="asRow(row).reEval"
            class="inline-block px-2 py-0.5 text-xs font-semibold rounded border bg-blue-50 text-blue-700 border-blue-200"
          >
            Yes
          </span>
          <span v-else class="text-sm text-neutral-400">-</span>
        </template>

        <template #cell-evaluator="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).evaluator ?? 'None assigned' }}</span>
        </template>

        <template #cell-completedDate="{ row }">
          <span class="text-sm text-neutral-700">{{ formatDate(asRow(row).completedDate) }}</span>
        </template>

        <template #cell-startDate="{ row }">
          <span class="text-sm text-neutral-700">{{ formatDate(asRow(row).startDate) }}</span>
        </template>

        <template #cell-lastReEvalDate="{ row }">
          <span class="text-sm text-neutral-700">{{ formatDate(asRow(row).lastReEvalDate) }}</span>
        </template>

        <template #cell-lastReEvalBy="{ row }">
          <span class="text-sm text-neutral-700">{{ asRow(row).lastReEvalBy ?? '-' }}</span>
        </template>

        <template #cell-actions="{ row }">
          <button
            v-if="asRow(row).id"
            class="px-3 py-1 text-xs font-semibold text-white bg-[#0f3f52] border border-[#0f3f52] rounded hover:bg-[#0c3444] transition-colors"
            @click="viewAssessment(asRow(row).id!)"
          >
            View
          </button>
          <button
            v-else-if="asRow(row).studentId"
            :disabled="startingStudentId === asRow(row).studentId"
            class="px-3 py-1 text-xs font-semibold text-white bg-[#0f3f52] border border-[#0f3f52] rounded hover:bg-[#0c3444] disabled:bg-neutral-300 disabled:border-neutral-300 transition-colors"
            @click="startAssessment(asRow(row))"
          >
            {{ startingStudentId === asRow(row).studentId ? 'Starting...' : 'Start' }}
          </button>
          <span v-else class="text-xs text-neutral-400">No student</span>
        </template>
      </AppDataTable>
    </BaseCard>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import { api, ApiError } from '../../utils/api';
import AppShell from '../../components/layout/AppShell.vue';
import CoordinatorSubNav from '../../components/layout/CoordinatorSubNav.vue';
import BaseCard from '../../components/ui/BaseCard.vue';
import StatCard from '../../components/ui/StatCard.vue';
import NoCycleNotice from '../../components/ui/NoCycleNotice.vue';
import LoadingState from '../../components/ui/LoadingState.vue';
import ErrorState from '../../components/ui/ErrorState.vue';
import AppDataTable from '../../components/ui/data-table/AppDataTable.vue';
import AppAutocomplete from '../../components/ui/AppAutocomplete.vue';
import type { DataTableColumn } from '../../components/ui/data-table/types';
import { useToast } from '../../composables/useToast';

const authStore = useAuthStore();
const router = useRouter();
const toast = useToast();

const currentUser = computed(() => authStore.user ? {
  firstName: authStore.user.firstName,
  lastName: authStore.user.lastName,
  email: authStore.user.email,
} : null);

interface AssessmentRow {
  id: number | null;
  studentId?: number;
  studentName: string;
  school: string | null;
  classCode: string | null;
  teacher: string | null;
  program: string | null;
  status: string;
  score: number | null;
  reEval: boolean;
  evaluator: string | null;
  completedDate: string | null;
  startDate: string | null;
  lastReEvalDate: string | null;
  lastReEvalBy: string | null;
}

interface FilterOption { id: number; name: string; }

interface VerificationResponse {
  stats: { total: number; completed: number; inProgress: number; notStarted: number };
  assessments: AssessmentRow[];
  filterOptions: {
    schools: FilterOption[];
    classes: FilterOption[];
    evaluators: FilterOption[];
    programs: FilterOption[];
  };
}

const isLoading = ref(false);
const error = ref<string | null>(null);
const noCycle = ref(false);
const startingStudentId = ref<number | null>(null);
const cycleId = ref<number | null>(null);
const assessments = ref<AssessmentRow[]>([]);
const stats = ref({ total: 0, completed: 0, inProgress: 0, notStarted: 0 });
const filterOptions = ref<VerificationResponse['filterOptions']>({
  schools: [], classes: [], evaluators: [], programs: [],
});

const filters = ref({
  schoolId: null as number | null,
  classId: null as number | null,
  evaluatorId: null as number | null,
  reEval: null as string | null,
  status: null as string | null,
  programId: null as number | null,
});

const schoolOptions = computed(() => [
  { value: null, label: 'All Schools' },
  ...filterOptions.value.schools.map((s) => ({ value: s.id, label: s.name })),
]);

// const classOptions = computed(() => [
//   { value: null, label: 'All Classes' },
//   ...filterOptions.value.classes.map((c) => ({ value: c.id, label: c.name })),
// ]);

const evaluatorOptions = computed(() => [
  { value: null, label: 'All Evaluators' },
  ...filterOptions.value.evaluators.map((e) => ({ value: e.id, label: e.name })),
]);

const reEvalOptions = [
  { value: null, label: 'All' },
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
];

const statusOptions = [
  { value: null, label: 'All Statuses' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'NOT_STARTED', label: 'Not Started' },
  { value: 'ABSENT', label: 'Absent' },
];

// const programOptions = computed(() => [
//   { value: null, label: 'All Programs' },
//   ...filterOptions.value.programs.map((p) => ({ value: p.id, label: p.name })),
// ]);

const columns: DataTableColumn<AssessmentRow>[] = [
  { key: 'studentName', header: 'Student Name', sortable: true, searchable: true, value: (r) => r.studentName },
  { key: 'school', header: 'School', sortable: true, searchable: true, value: (r) => r.school ?? '' },
  // { key: 'classCode', header: 'Class', sortable: true, searchable: true, value: (r) => r.classCode ?? '' },
  // { key: 'teacher', header: 'Teacher', sortable: true, searchable: true, value: (r) => r.teacher ?? '' },
  // { key: 'program', header: 'Program', sortable: true, searchable: true, value: (r) => r.program ?? '' },
  { key: 'status', header: 'Status', sortable: true, searchable: true, value: (r) => r.status },
  { key: 'score', header: 'Score', sortable: true, searchable: false, value: (r) => r.score ?? '' },
  { key: 'reEval', header: 'Re-eval', sortable: true, searchable: false, value: (r) => r.reEval ? 'Yes' : 'No' },
  { key: 'evaluator', header: 'Evaluator', sortable: true, searchable: true, value: (r) => r.evaluator ?? '' },
  { key: 'completedDate', header: 'Completed Date', sortable: true, searchable: false, value: (r) => r.completedDate ?? '' },
  { key: 'startDate', header: 'Start Date', sortable: true, searchable: false, value: (r) => r.startDate ?? '' },
  { key: 'lastReEvalDate', header: 'Last Re-eval Date', sortable: true, searchable: false, value: (r) => r.lastReEvalDate ?? '' },
  { key: 'lastReEvalBy', header: 'Last Re-eval By', sortable: true, searchable: true, value: (r) => r.lastReEvalBy ?? '' },
  { key: 'actions', header: 'Actions', sortable: false, searchable: false, value: () => '' },
];

function asRow(row: unknown): AssessmentRow {
  return row as AssessmentRow;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'Completed';
    case 'IN_PROGRESS': return 'In Progress';
    case 'NOT_STARTED': return 'Not Started';
    case 'ABSENT': return 'Absent';
    default: return status;
  }
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED': return 'bg-green-50 text-green-700 border-green-300';
    case 'IN_PROGRESS': return 'bg-yellow-50 text-yellow-700 border-yellow-300';
    case 'NOT_STARTED': return 'bg-neutral-100 text-neutral-500 border-neutral-300';
    case 'ABSENT': return 'bg-red-50 text-red-600 border-red-300';
    default: return 'bg-neutral-100 text-neutral-500 border-neutral-300';
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

function viewAssessment(id: number) {
  router.push({ path: `/evaluator/assessments/${id}`, query: { from: 'coordinator-verification' } });
}

async function startAssessment(row: AssessmentRow) {
  if (!row.studentId || !cycleId.value) return;

  startingStudentId.value = row.studentId;
  try {
    const assessment = await api.post<{ id: number }>('/assessments/start', {
      studentId: row.studentId,
      cycleId: cycleId.value,
    });
    router.push({
      path: `/evaluator/assessments/${assessment.id}`,
      query: { from: 'coordinator-verification' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to start assessment';
    toast.error(message);
  } finally {
    startingStudentId.value = null;
  }
}

async function fetchData() {
  isLoading.value = true;
  error.value = null;
  try {
    const params: Record<string, unknown> = {};
    if (filters.value.schoolId !== null) params.schoolId = filters.value.schoolId;
    if (filters.value.classId !== null) params.classId = filters.value.classId;
    if (filters.value.evaluatorId !== null) params.evaluatorId = filters.value.evaluatorId;
    if (filters.value.reEval !== null) params.reEval = filters.value.reEval;
    if (filters.value.status !== null) params.status = filters.value.status;
    if (filters.value.programId !== null) params.programId = filters.value.programId;

    const data = await api.get<VerificationResponse>('/admin/dashboard/verification', params);
    assessments.value = data.assessments;
    stats.value = data.stats;
    filterOptions.value = data.filterOptions;
  } catch (err) {
    if (err instanceof ApiError && err.code === 'CYCLE_NOT_APPROVED') {
      noCycle.value = true;
    } else {
      error.value = err instanceof Error ? err.message : 'Failed to load verification data';
    }
  } finally {
    isLoading.value = false;
  }
}

function applyFilters() {
  fetchData();
}

onMounted(async () => {
  try {
    const cycle = await api.get<{ id: number }>('/cycles/active');
    cycleId.value = cycle?.id ?? null;
  } catch {
    // No active cycle
  }
  fetchData();
});
</script>
