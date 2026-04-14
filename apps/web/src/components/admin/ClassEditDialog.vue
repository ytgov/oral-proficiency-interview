<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center">
    <!-- Backdrop -->
    <div class="absolute inset-0 bg-black/50" @click="close"></div>

    <!-- Dialog -->
    <div class="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
      <!-- Header -->
      <div class="flex items-center justify-between p-6 border-b border-neutral-200">
        <h2 class="text-xl font-semibold text-neutral-900">Edit Class</h2>
        <button class="text-neutral-400 hover:text-neutral-600" @click="close">
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="p-6 space-y-5">
        <!-- Read-only -->
        <div class="bg-neutral-50 rounded-lg p-4 space-y-2">
          <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Read-only</p>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span class="text-neutral-500">Class Code:</span>
              <span class="ml-1 font-medium text-neutral-900">{{ classItem?.classCode }}</span>
            </div>
            <div>
              <span class="text-neutral-500">School:</span>
              <span class="ml-1 font-medium text-neutral-900">{{ classItem?.school?.name }}</span>
            </div>
          </div>
        </div>

        <!-- Teacher autocomplete -->
        <div>
          <AppAutocomplete
            v-model="form.teacherId"
            :options="teacherOptions"
            label="Teacher"
            placeholder="Search for a teacher..."
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">Grade</label>
          <input
            v-model.number="form.grade"
            type="number"
            class="w-full px-3 py-2 border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-neutral-700 mb-1">Program</label>
          <select
            v-model.number="form.programId"
            class="w-full px-3 py-2 border border-neutral-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option :value="0">No Program</option>
            <option v-for="program in programs" :key="program.id" :value="program.id">
              {{ program.name }}
            </option>
          </select>
        </div>

        <!-- Error -->
        <div v-if="error" class="bg-red-50 border border-red-200 rounded-lg p-3">
          <p class="text-sm text-red-800">{{ error }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="flex justify-end gap-3 p-6 border-t border-neutral-200">
        <button
          class="px-4 py-2 text-sm text-neutral-700 bg-neutral-100 hover:bg-neutral-200"
          @click="close"
        >
          Cancel
        </button>
        <button
          :disabled="isSaving || !hasChanges"
          class="px-4 py-2 text-sm text-white bg-[#0f3f52] hover:bg-[#0c3444] disabled:bg-neutral-300 disabled:cursor-not-allowed"
          @click="save"
        >
          {{ isSaving ? 'Saving...' : 'Save Changes' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { X } from 'lucide-vue-next';
import { api } from '../../utils/api';
import AppAutocomplete from '../ui/AppAutocomplete.vue';

interface ClassDetail {
  id: number;
  classCode: string;
  grade?: number | null;
  isManuallyEdited: boolean;
  school?: { id: number; schoolCode: string; name: string };
  program?: { id: number; name: string } | null;
  teacher?: { id: number; teacherId: string; name: string } | null;
}

interface Program {
  id: number;
  name: string;
}

interface Teacher {
  id: number;
  teacherId: string;
  name: string;
}

const props = defineProps<{
  visible: boolean;
  classItem: ClassDetail | null;
  programs: Program[];
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const form = ref({
  teacherId: null as number | null,
  grade: null as number | null,
  programId: 0,
});

const isSaving = ref(false);
const error = ref<string | null>(null);
const teachers = ref<Teacher[]>([]);

const teacherOptions = computed(() =>
  teachers.value.map((t) => ({
    value: t.id,
    label: `${t.name} (${t.teacherId})`,
  })),
);

const hasChanges = computed(() => {
  if (!props.classItem) return false;
  return (
    form.value.teacherId !== (props.classItem.teacher?.id ?? null) ||
    form.value.grade !== props.classItem.grade ||
    form.value.programId !== (props.classItem.program?.id ?? 0)
  );
});

watch(() => props.visible, async (isVisible) => {
  if (isVisible) {
    await fetchTeachers();
    // Initialize form after teachers are loaded so the autocomplete can resolve the label
    if (props.classItem) {
      form.value = {
        teacherId: props.classItem.teacher?.id ?? null,
        grade: props.classItem.grade ?? null,
        programId: props.classItem.program?.id ?? 0,
      };
      error.value = null;
    }
  }
});

watch(() => props.classItem, (cls) => {
  if (cls) {
    form.value = {
      teacherId: cls.teacher?.id ?? null,
      grade: cls.grade ?? null,
      programId: cls.program?.id ?? 0,
    };
    error.value = null;
  }
}, { immediate: true });

async function fetchTeachers() {
  try {
    teachers.value = await api.get<Teacher[]>('/admin/teachers');
  } catch {
    teachers.value = [];
  }
}

function close() {
  emit('close');
}

async function save() {
  if (!props.classItem || !hasChanges.value) return;
  isSaving.value = true;
  error.value = null;

  try {
    const payload: Record<string, unknown> = {};

    if (form.value.teacherId !== (props.classItem.teacher?.id ?? null)) {
      payload.teacherId = form.value.teacherId;
    }
    if (form.value.grade !== props.classItem.grade) {
      payload.grade = form.value.grade;
    }
    if (form.value.programId !== (props.classItem.program?.id ?? 0)) {
      payload.programId = form.value.programId || null;
    }

    await api.patch(`/admin/classes/${props.classItem.id}`, payload);
    emit('saved');
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to save changes';
  } finally {
    isSaving.value = false;
  }
}
</script>
