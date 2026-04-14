<template>
  <AppShell :user="currentUser">
    <AdminSubNav />

    <div class="container mx-auto px-6 py-8">
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-neutral-900 mb-2">Cycle Management</h1>
        <p class="text-neutral-600">Seed data from the data warehouse, approve, and reset cycles.</p>
      </div>

      <!-- No Active Cycle Banner -->
      <div v-if="!activeCycle && !isLoading" class="mb-6">
        <BaseCard v-if="resetStatus?.status === 'completed'" variant="warning">
          <div class="flex items-start gap-3">
            <TriangleAlert class="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 class="font-semibold text-neutral-900 mb-1">System Ready for New Cohort</h3>
              <p class="text-sm text-neutral-600">The previous cycle has been reset. Seed data from the data warehouse to create a new cycle.</p>
            </div>
          </div>
        </BaseCard>
        <BaseCard v-else variant="warning">
          <div class="flex items-start gap-3">
            <TriangleAlert class="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 class="font-semibold text-neutral-900 mb-1">No Active Cycle</h3>
              <p class="text-sm text-neutral-600">Seed data from the data warehouse to create a new assessment cycle automatically.</p>
            </div>
          </div>
        </BaseCard>
      </div>

      <!-- Loading -->
      <div v-if="isLoading" class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-900" />
      </div>

      <template v-else>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

          <!-- Active Cycle Card -->
          <BaseCard v-if="activeCycle">
            <h2 class="text-xl font-semibold text-neutral-900 mb-4">Active Cycle</h2>
            <div class="space-y-4">
              <!-- Editable before approval -->
              <template v-if="!activeCycle.isApproved">
                <div>
                  <label class="block text-sm text-neutral-500 mb-1">Cycle Name</label>
                  <input
                    v-model="editCycle.name"
                    type="text"
                    maxlength="100"
                    class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm text-neutral-500 mb-1">Start Date</label>
                    <input
                      v-model="editCycle.startsOn"
                      type="date"
                      class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <div>
                    <label class="block text-sm text-neutral-500 mb-1">End Date</label>
                    <input
                      v-model="editCycle.endsOn"
                      type="date"
                      class="w-full px-3 py-2 border border-neutral-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                </div>
                <button
                  v-if="cycleHasEdits"
                  :disabled="isSavingCycle"
                  class="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-neutral-300 transition-colors text-sm"
                  @click="handleUpdateCycle"
                >
                  {{ isSavingCycle ? 'Saving...' : 'Save Changes' }}
                </button>
              </template>

              <!-- Read-only after approval -->
              <template v-else>
                <div>
                  <div class="text-sm text-neutral-500">Cycle Name</div>
                  <div class="font-semibold text-neutral-900">{{ activeCycle.name }}</div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <div class="text-sm text-neutral-500">Start Date</div>
                    <div class="font-medium text-neutral-900">{{ formatDate(activeCycle.startsOn) }}</div>
                  </div>
                  <div>
                    <div class="text-sm text-neutral-500">End Date</div>
                    <div class="font-medium text-neutral-900">{{ formatDate(activeCycle.endsOn) }}</div>
                  </div>
                </div>
              </template>
              <div>
                <div class="text-sm text-neutral-500 mb-2">Status</div>
                <div v-if="activeCycle.isApproved" class="flex items-center gap-2 text-green-600">
                  <span class="font-semibold">Approved &amp; Active</span>
                </div>
                <div v-else-if="hasCycleData" class="flex items-center gap-2 text-blue-600">
                  <span class="font-semibold">Data Loaded &mdash; Ready for Approval</span>
                </div>
                <div v-else class="flex items-center gap-2 text-yellow-600">
                  <span class="font-semibold">Awaiting Data</span>
                </div>
              </div>
              <div v-if="activeCycle.dataApprovedAt && activeCycle.approver">
                <div class="text-sm text-neutral-500">Approved By</div>
                <div class="text-neutral-900">
                  {{ activeCycle.approver.firstName }} {{ activeCycle.approver.lastName }}
                  <span class="text-sm text-neutral-500">on {{ formatDate(activeCycle.dataApprovedAt) }}</span>
                </div>
              </div>
              <!-- Data summary -->
              <div v-if="hasCycleData && cycleDataCounts" class="grid grid-cols-3 gap-3 text-sm bg-neutral-50 rounded-lg p-3">
                <div><span class="text-neutral-500">Schools:</span> <span class="font-medium">{{ cycleDataCounts.schools }}</span></div>
                <div><span class="text-neutral-500">Students:</span> <span class="font-medium">{{ cycleDataCounts.students }}</span></div>
                <div><span class="text-neutral-500">Classes:</span> <span class="font-medium">{{ cycleDataCounts.classes }}</span></div>
              </div>

              <button
                v-if="!activeCycle.isApproved"
                :disabled="isApproving || !hasCycleData"
                class="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors"
                @click="handleApproveCycle"
              >
                {{ isApproving ? 'Approving...' : 'Approve Cycle Data' }}
              </button>
              <p v-if="!hasCycleData && !activeCycle.isApproved" class="text-sm text-neutral-500">
                Seed data from the data warehouse below before approving.
              </p>
            </div>
          </BaseCard>
        </div>

                <!-- Reset Cycle Section -->
                <BaseCard class="mb-8 border-red-200">
          <h2 class="text-xl font-semibold text-neutral-900 mb-1">Reset Cycle</h2>
          <p class="text-sm text-neutral-600 mb-4">
            Purge all records for the active cycle. This is irreversible.
          </p>

          <!-- Reset Status (when running or completed) -->
          <div v-if="resetStatus && resetStatus.status !== 'idle'" class="mb-4">
            <div class="rounded-lg border border-neutral-200 p-4">
              <div class="flex items-center gap-3 mb-3">
                <span
                  class="inline-flex items-center px-3 py-1 rounded text-sm font-bold"
                  :class="resetBadgeClass"
                >
                  <span v-if="resetStatus.status === 'exporting' || resetStatus.status === 'purging'" class="animate-spin mr-2 h-3 w-3 border-2 border-current border-t-transparent rounded-full"></span>
                  {{ resetLabel }}
                </span>
              </div>
              <div class="space-y-2 text-sm">
                <div v-if="resetStatus.startedAt" class="flex justify-between">
                  <span class="text-neutral-500">Started</span>
                  <span class="text-neutral-900">{{ formatDateTime(resetStatus.startedAt) }}</span>
                </div>
                <div v-if="resetStatus.purgedAssessments !== undefined" class="flex justify-between">
                  <span class="text-neutral-500">Assessments Purged</span>
                  <span class="text-neutral-900">{{ resetStatus.purgedAssessments }}</span>
                </div>
                <div v-if="resetStatus.purgedAudioFiles !== undefined" class="flex justify-between">
                  <span class="text-neutral-500">Audio Files Deleted</span>
                  <span class="text-neutral-900">{{ resetStatus.purgedAudioFiles }}</span>
                </div>
                <div v-if="resetStatus.completedAt" class="flex justify-between">
                  <span class="text-neutral-500">Completed</span>
                  <span class="text-green-700 font-medium">{{ formatDateTime(resetStatus.completedAt) }}</span>
                </div>
                <div v-if="resetStatus.error" class="bg-red-50 border border-red-200 rounded p-3 mt-2">
                  <p class="text-red-800 text-sm">{{ resetStatus.error }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Reset trigger -->
          <div v-if="!resetStatus || resetStatus.status === 'idle' || resetStatus.status === 'completed' || resetStatus.status === 'failed'" class="flex items-center justify-between">
            <div>
              <p v-if="activeCycle" class="text-sm text-neutral-600">
                This will permanently purge cycle <strong>"{{ activeCycle.name }}"</strong>.
              </p>
              <p v-else class="text-sm text-neutral-500">
                No active cycle to reset.
              </p>
            </div>
            <button
              :disabled="!activeCycle || !activeCycle.isApproved"
              class="flex-shrink-0 px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:bg-neutral-300 disabled:cursor-not-allowed"
              @click="showConfirmDialog = true"
            >
              Reset Cycle
            </button>
          </div>
        </BaseCard>

        <!-- Data Warehouse Section -->
        <BaseCard class="mb-8">
          <h2 class="text-xl font-semibold text-neutral-900 mb-1">Data Warehouse</h2>
          <p class="text-sm text-neutral-600 mb-4">
            The data warehouse pushes student/class data into a staging area. When ready, trigger seeding to populate the cycle.
          </p>

          <div v-if="isLoadingWarehouse" class="flex items-center gap-2 text-neutral-500 py-4">
            <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-500" />
            <span class="text-sm">Checking staging data...</span>
          </div>

          <template v-else>
            <!-- No staging data -->
            <div v-if="!warehouseBatch" class="bg-neutral-50 rounded-lg p-6 text-center">
              <p class="text-neutral-500 mb-1">No staging data available.</p>
              <p class="text-sm text-neutral-400">
                The data warehouse has not pushed any data yet. When data is sent via
                <code class="bg-neutral-200 px-1 rounded text-xs">PUT /data-warehouse/push</code>,
                it will appear here.
              </p>
            </div>

            <!-- Staging data exists -->
            <div v-else>
              <div class="rounded-lg border border-neutral-200 divide-y divide-neutral-200">
                <div class="p-4 flex items-center justify-between">
                  <div>
                    <span class="text-sm font-medium text-neutral-900">Batch #{{ warehouseBatch.batchId }}</span>
                    <span class="mx-2 text-neutral-300">|</span>
                    <span class="text-sm text-neutral-600">{{ warehouseBatch.recordCount.toLocaleString() }} records</span>
                    <span class="mx-2 text-neutral-300">|</span>
                    <span class="text-sm text-neutral-600">Year: {{ warehouseBatch.targetYear }}</span>
                  </div>
                  <span
                    class="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                    :class="warehouseStatusClasses[warehouseBatch.status] || 'bg-neutral-100 text-neutral-700'"
                  >
                    {{ warehouseBatch.status }}
                  </span>
                </div>
                <div class="p-4 text-sm text-neutral-500">
                  Received: {{ formatDateTime(warehouseBatch.receivedAt) }}
                  <template v-if="warehouseBatch.seededAt">
                    &bull; Seeded: {{ formatDateTime(warehouseBatch.seededAt) }}
                  </template>
                </div>
                <div v-if="warehouseBatch.errorMessage" class="p-4 bg-red-50 text-sm text-red-700">
                  {{ warehouseBatch.errorMessage }}
                </div>
              </div>

              <!-- Seed button -->
              <div v-if="warehouseBatch.status === 'PENDING'" class="mt-4">
                <div v-if="activeCycle" class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                  <p class="text-sm text-amber-800">
                    <strong>Reset required.</strong> An active cycle already exists. Reset the current cycle before seeding new data.
                  </p>
                </div>
                <div v-else class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p class="text-sm text-blue-800">
                    <strong>Ready to seed.</strong> This will create a new cycle for year
                    {{ warehouseBatch.targetYear }} and import all
                    {{ warehouseBatch.recordCount.toLocaleString() }} records (schools, teachers,
                    students, classes, and enrollments).
                  </p>
                </div>
                <button
                  :disabled="isSeeding || !!activeCycle"
                  class="px-5 py-2 bg-yukon-navy text-white rounded-md hover:bg-[#122937] disabled:bg-neutral-300 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
                  @click="handleSeed"
                >
                  {{ isSeeding ? 'Seeding...' : 'Seed Data from Staging' }}
                </button>
              </div>

              <!-- Seed results -->
              <div v-if="seedResult" class="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <p class="font-semibold text-green-800 mb-2">Seeding Complete</p>
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-green-700">
                  <div>Schools: {{ seedResult.summary.schools }}</div>
                  <div>Programs: {{ seedResult.summary.programs }}</div>
                  <div>Teachers: {{ seedResult.summary.teachers }}</div>
                  <div>Students: {{ seedResult.summary.students }}</div>
                  <div>Classes: {{ seedResult.summary.classes }}</div>
                  <div>Enrollments: {{ seedResult.summary.enrollments }}</div>
                </div>
              </div>
            </div>
          </template>
        </BaseCard>

      </template>

      <!-- Error -->
      <div v-if="error" class="mb-6">
        <BaseCard variant="error">
          <div class="text-red-600">{{ error }}</div>
        </BaseCard>
      </div>

      <!-- 3-Step Confirmation Dialog -->
      <div
        v-if="showConfirmDialog"
        class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
        @click.self="closeConfirmDialog"
      >
        <div class="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
          <!-- Step indicator -->
          <div class="flex items-center gap-2 mb-5">
            <span v-for="s in 3" :key="s" class="flex items-center gap-1">
              <span
                class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                :class="s <= confirmStep ? 'bg-red-600 text-white' : 'bg-neutral-200 text-neutral-500'"
              >{{ s }}</span>
              <span v-if="s < 3" class="w-6 h-px" :class="s < confirmStep ? 'bg-red-600' : 'bg-neutral-200'" />
            </span>
          </div>

          <!-- Step 1: Warning -->
          <template v-if="confirmStep === 1">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <TriangleAlert class="w-5 h-5 text-red-600" />
              </div>
              <h3 class="text-lg font-semibold text-neutral-900">Permanent Data Deletion</h3>
            </div>

            <p class="text-sm text-neutral-700 mb-3">
              This action will <strong>permanently delete ALL</strong> student data, assessment results, evaluator assignments, and audio recordings.
            </p>
            <p class="text-sm text-red-700 font-semibold mb-4">
              This action cannot be undone.
            </p>

            <div class="flex justify-end gap-3">
              <button class="px-4 py-2 bg-neutral-100 text-neutral-700 text-sm rounded-md hover:bg-neutral-200" @click="closeConfirmDialog">Cancel</button>
              <button class="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700" @click="confirmStep = 2">Continue</button>
            </div>
          </template>

          <!-- Step 2: Type confirmation -->
          <template v-if="confirmStep === 2">
            <h3 class="text-lg font-semibold text-neutral-900 mb-4">Type Confirmation</h3>
            <p class="text-sm text-neutral-600 mb-4">
              To proceed, type <strong class="text-red-700">DELETE ALL DATA</strong> below (case-sensitive):
            </p>
            <input
              v-model="confirmInput"
              type="text"
              placeholder="DELETE ALL DATA"
              class="w-full rounded-md border-neutral-300 shadow-sm focus:border-red-500 focus:ring-red-500 text-sm mb-4 px-3 py-2 border"
            />
            <div class="flex justify-end gap-3">
              <button class="px-4 py-2 bg-neutral-100 text-neutral-700 text-sm rounded-md hover:bg-neutral-200" @click="confirmStep = 1; confirmInput = ''">Back</button>
              <button
                :disabled="confirmInput !== 'DELETE ALL DATA'"
                class="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                @click="fetchPurgeSummaryAndAdvance"
              >
                Continue
              </button>
            </div>
          </template>

          <!-- Step 3: Summary + final confirm -->
          <template v-if="confirmStep === 3">
            <h3 class="text-lg font-semibold text-neutral-900 mb-4">Final Confirmation</h3>

            <div v-if="isLoadingSummary" class="flex items-center gap-2 text-neutral-500 py-4">
              <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-neutral-500" />
              <span class="text-sm">Loading summary...</span>
            </div>

            <template v-else-if="purgeSummary">
              <!-- Blocked -->
              <div v-if="!purgeSummary.canPurge" class="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p class="text-sm text-red-800 font-semibold">Cannot reset cycle</p>
                <p class="text-sm text-red-700 mt-1">{{ purgeSummary.blockReason }}</p>
              </div>

              <!-- Summary counts -->
              <div class="bg-neutral-50 rounded-lg p-4 mb-4 space-y-2 text-sm">
                <div class="flex justify-between"><span class="text-neutral-600">Students</span><span class="font-semibold text-neutral-900">{{ purgeSummary.students }}</span></div>
                <div class="flex justify-between"><span class="text-neutral-600">Assessments</span><span class="font-semibold text-neutral-900">{{ purgeSummary.assessments }}</span></div>
                <div class="flex justify-between"><span class="text-neutral-600">Audio Recordings</span><span class="font-semibold text-neutral-900">{{ purgeSummary.audioFiles }}</span></div>
                <div class="flex justify-between border-t border-neutral-200 pt-2"><span class="text-neutral-900 font-semibold">Total Records to Delete</span><span class="font-bold text-red-700">{{ purgeSummary.totalRecords }}</span></div>
              </div>

              <div class="flex justify-end gap-3">
                <button class="px-4 py-2 bg-neutral-100 text-neutral-700 text-sm rounded-md hover:bg-neutral-200" @click="confirmStep = 2">Back</button>
                <button
                  :disabled="!purgeSummary.canPurge || isResetting"
                  class="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  @click="executeReset"
                >
                  {{ isResetting ? 'Starting...' : 'Confirm Permanent Deletion' }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { TriangleAlert } from 'lucide-vue-next';
import { useAuthStore } from '../../../stores/auth';
import AppShell from '../../../components/layout/AppShell.vue';
import AdminSubNav from '../../../components/layout/AdminSubNav.vue';
import BaseCard from '../../../components/ui/BaseCard.vue';
import { api } from '../../../utils/api';
import { getEnv } from '../../../utils/env';

const authStore = useAuthStore();
const API_BASE = getEnv('VITE_API_URL') || 'http://localhost:3000/api/v1';

const currentUser = computed(() => authStore.user ? {
  firstName: authStore.user.firstName,
  lastName: authStore.user.lastName,
  email: authStore.user.email,
} : null);

// ─── Types ────────────────────────────────────────────────────────────────────

interface Cycle {
  id: number;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
  isApproved: boolean;
  retentionDays?: number | null;
  dataApprovedAt?: string;
  approver?: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  };
}

interface WarehouseBatch {
  batchId: number;
  status: string;
  recordCount: number;
  targetYear: number;
  receivedAt: string;
  seededAt?: string;
  errorMessage?: string;
  message?: string;
}

interface SeedResult {
  batchId: number;
  status: string;
  cycleId: number;
  cycleName: string;
  summary: {
    schools: number;
    programs: number;
    teachers: number;
    students: number;
    classes: number;
    enrollments: number;
  };
}

interface ResetStatusData {
  status: 'idle' | 'exporting' | 'purging' | 'completed' | 'failed';
  cycleId?: number;
  cycleName?: string;
  startedAt?: string;
  completedAt?: string;
  exportedRecords?: number;
  purgedAssessments?: number;
  purgedStudents?: number;
  purgedAudioFiles?: number;
  error?: string;
}

interface PrePurgeSummary {
  cycleId: number;
  cycleName: string;
  students: number;
  assessments: number;
  assessmentsInProgress: number;
  assessmentsNotStarted: number;
  audioFiles: number;
  totalRecords: number;
  canPurge: boolean;
  blockReason?: string;
}

// ─── State ────────────────────────────────────────────────────────────────────

const isLoading = ref(true);
const error = ref<string | null>(null);

// Cycle
const activeCycle = ref<Cycle | null>(null);
const cycleDataCounts = ref<{ schools: number; programs: number; classes: number; students: number; enrollments: number } | null>(null);
const hasCycleData = computed(() => cycleDataCounts.value != null && cycleDataCounts.value.students > 0);
const isApproving = ref(false);
const isSavingCycle = ref(false);
const editCycle = ref({ name: '', startsOn: '', endsOn: '' });

const cycleHasEdits = computed(() => {
  if (!activeCycle.value) return false;
  return (
    editCycle.value.name !== activeCycle.value.name ||
    editCycle.value.startsOn !== toDateInput(activeCycle.value.startsOn) ||
    editCycle.value.endsOn !== toDateInput(activeCycle.value.endsOn)
  );
});

watch(activeCycle, (cycle) => {
  if (cycle) {
    editCycle.value = {
      name: cycle.name,
      startsOn: toDateInput(cycle.startsOn),
      endsOn: toDateInput(cycle.endsOn),
    };
  }
}, { immediate: true });

// Data warehouse
const warehouseBatch = ref<WarehouseBatch | null>(null);
const isLoadingWarehouse = ref(true);
const isSeeding = ref(false);
const seedResult = ref<SeedResult | null>(null);

const warehouseStatusClasses: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  SEEDING: 'bg-blue-100 text-blue-800',
  SEEDED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

// Reset
const resetStatus = ref<ResetStatusData | null>(null);
const showConfirmDialog = ref(false);
const confirmStep = ref(1);
const confirmInput = ref('');
const isResetting = ref(false);
const purgeSummary = ref<PrePurgeSummary | null>(null);
const isLoadingSummary = ref(false);
let pollInterval: ReturnType<typeof setInterval> | null = null;

const resetLabel = computed(() => {
  if (!resetStatus.value) return '';
  const labels: Record<string, string> = {
    idle: 'Idle',
    exporting: 'Exporting Data...',
    purging: 'Purging Records...',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[resetStatus.value.status] || resetStatus.value.status;
});

const resetBadgeClass = computed(() => {
  if (!resetStatus.value) return '';
  const classes: Record<string, string> = {
    idle: 'bg-neutral-100 text-neutral-700',
    exporting: 'bg-blue-100 text-blue-700',
    purging: 'bg-amber-100 text-amber-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return classes[resetStatus.value.status] || '';
});

// ─── Formatting ───────────────────────────────────────────────────────────────

const toDateInput = (dateString: string) => {
  if (!dateString) return '';
  return new Date(dateString).toISOString().split('T')[0];
};

const formatDate = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatDateTime = (dateString: string) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// ─── Fetches ──────────────────────────────────────────────────────────────────

const fetchActiveCycle = async () => {
  try {
    activeCycle.value = await api.get<Cycle>('/cycles/active');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message.includes('404') || message.includes('403')) {
      activeCycle.value = null;
      return;
    }
    error.value = message;
  }
};

const fetchCycleDataCounts = async () => {
  if (!activeCycle.value) {
    cycleDataCounts.value = null;
    return;
  }
  try {
    const result = await api.get<{ counts: typeof cycleDataCounts.value }>(`/admin/cycles/${activeCycle.value.id}/ingestion-status`);
    cycleDataCounts.value = result.counts;
  } catch {
    cycleDataCounts.value = null;
  }
};

const fetchWarehouseStatus = async () => {
  isLoadingWarehouse.value = true;
  try {
    const result = await api.get<WarehouseBatch>('/data-warehouse/status');
    warehouseBatch.value = result && result.batchId ? result : null;
  } catch {
    warehouseBatch.value = null;
  } finally {
    isLoadingWarehouse.value = false;
  }
};

async function fetchResetStatus() {
  try {
    const res = await fetch(`${API_BASE}/admin/reset/status`, {
      headers: { 'Authorization': `Bearer ${authStore.token}` },
    });
    if (res.ok) {
      resetStatus.value = await res.json();
      if (resetStatus.value && (resetStatus.value.status === 'exporting' || resetStatus.value.status === 'purging')) {
        startPolling();
      } else {
        stopPolling();
        // If reset just completed, refresh cycle data
        if (resetStatus.value?.status === 'completed') {
          await fetchActiveCycle();
        }
      }
    }
  } catch {
    // Silently fail for status polling
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────

const handleUpdateCycle = async () => {
  if (!activeCycle.value) return;
  isSavingCycle.value = true;
  error.value = null;

  try {
    await api.patch(`/admin/cycles/${activeCycle.value.id}`, {
      name: editCycle.value.name,
      startsOn: editCycle.value.startsOn,
      endsOn: editCycle.value.endsOn,
    });
    await fetchActiveCycle();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update cycle';
  } finally {
    isSavingCycle.value = false;
  }
};

const handleApproveCycle = async () => {
  if (!activeCycle.value) return;
  isApproving.value = true;
  error.value = null;

  try {
    await api.post(`/admin/cycles/${activeCycle.value.id}/approve`);
    await fetchActiveCycle();
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Unknown error';
  } finally {
    isApproving.value = false;
  }
};

const handleSeed = async () => {
  isSeeding.value = true;
  error.value = null;
  seedResult.value = null;

  try {
    const result = await api.post<SeedResult>('/data-warehouse/seed');
    seedResult.value = result;
    await fetchActiveCycle();
    await Promise.all([fetchCycleDataCounts(), fetchWarehouseStatus()]);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Seeding failed';
  } finally {
    isSeeding.value = false;
  }
};

function closeConfirmDialog() {
  showConfirmDialog.value = false;
  confirmStep.value = 1;
  confirmInput.value = '';
  purgeSummary.value = null;
}

async function fetchPurgeSummaryAndAdvance() {
  if (!activeCycle.value) return;
  isLoadingSummary.value = true;
  confirmStep.value = 3;

  try {
    purgeSummary.value = await api.get<PrePurgeSummary>(`/admin/reset/summary/${activeCycle.value.id}`);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to fetch summary';
    closeConfirmDialog();
  } finally {
    isLoadingSummary.value = false;
  }
}

async function executeReset() {
  if (!activeCycle.value) return;
  isResetting.value = true;

  try {
    const res = await fetch(`${API_BASE}/admin/reset`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authStore.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cycleId: activeCycle.value.id }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Failed to start reset');
    }

    resetStatus.value = await res.json();
    closeConfirmDialog();
    startPolling();
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to start reset';
  } finally {
    isResetting.value = false;
  }
}

function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(fetchResetStatus, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await fetchActiveCycle();
  await Promise.all([fetchCycleDataCounts(), fetchWarehouseStatus(), fetchResetStatus()]);
  isLoading.value = false;
});

onUnmounted(() => {
  stopPolling();
});
</script>
