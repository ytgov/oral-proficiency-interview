<template>
  <div ref="containerRef" class="relative">
    <label v-if="label" class="block text-sm font-medium text-neutral-600 uppercase tracking-wider mb-1">
      {{ label }}
    </label>
    
    <div class="relative">
      <input
        ref="inputRef"
        v-model="searchQuery"
        type="text"
        :placeholder="placeholder"
        class="w-full border border-neutral-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 pr-8"
        @focus="isOpen = true"
        @input="onInput"
        @keydown="onKeyDown"
      />
      
      <!-- Clear button -->
      <button
        v-if="searchQuery && allowClear"
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
        @click.stop="clearSelection"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <!-- Chevron button -->
      <button
        v-else
        type="button"
        class="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
        @click="toggleDropdown"
      >
        <svg
          class="w-4 h-4 transition-transform"
          :class="{ 'rotate-180': isOpen }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <!-- Dropdown -->
    <div
      v-if="isOpen && filteredOptions.length > 0"
      class="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto"
    >
      <div
        v-for="(option, index) in filteredOptions"
        :key="option.value ?? `option-${index}`"
        class="px-3 py-2 text-sm cursor-pointer hover:bg-neutral-100 transition-colors"
        :class="{
          'bg-neutral-100': index === highlightedIndex,
          'bg-blue-50': isSelected(option.value),
        }"
        @click="selectOption(option)"
        @mouseenter="highlightedIndex = index"
      >
        {{ option.label }}
      </div>
    </div>

    <!-- No results -->
    <div
      v-if="isOpen && searchQuery && filteredOptions.length === 0"
      class="absolute z-50 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg px-3 py-2 text-sm text-neutral-500"
    >
      No results found
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';

interface Option {
  value: string | number | null;
  label: string;
}

interface Props {
  modelValue: string | number | null;
  options: Option[];
  label?: string;
  placeholder?: string;
  allowClear?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search...',
  allowClear: true,
});

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null];
}>();

const containerRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const searchQuery = ref('');
const isOpen = ref(false);
const highlightedIndex = ref(0);

const filteredOptions = computed(() => {
  if (!searchQuery.value) {
    return props.options;
  }
  
  const query = searchQuery.value.toLowerCase();
  return props.options.filter((option) =>
    option.label.toLowerCase().includes(query)
  );
});

const selectedOption = computed(() => {
  return props.options.find((opt) => opt.value === props.modelValue);
});

function isSelected(value: string | number | null): boolean {
  return value === props.modelValue;
}

function selectOption(option: Option) {
  emit('update:modelValue', option.value);
  searchQuery.value = option.label;
  isOpen.value = false;
  highlightedIndex.value = 0;
}

function clearSelection() {
  searchQuery.value = '';
  emit('update:modelValue', null);
  isOpen.value = false;
  highlightedIndex.value = 0;
}

function toggleDropdown() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    inputRef.value?.focus();
  }
}

function onInput() {
  isOpen.value = true;
  highlightedIndex.value = 0;
}

function onKeyDown(event: KeyboardEvent) {
  if (!isOpen.value && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    isOpen.value = true;
    return;
  }

  if (!isOpen.value) return;

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      highlightedIndex.value = Math.min(highlightedIndex.value + 1, filteredOptions.value.length - 1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      highlightedIndex.value = Math.max(highlightedIndex.value - 1, 0);
      break;
    case 'Enter':
      event.preventDefault();
      if (filteredOptions.value[highlightedIndex.value]) {
        selectOption(filteredOptions.value[highlightedIndex.value]);
      }
      break;
    case 'Escape':
      event.preventDefault();
      isOpen.value = false;
      break;
  }
}

function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    isOpen.value = false;
  }
}

// Update search query when modelValue or options change externally
watch([() => props.modelValue, () => props.options], ([newValue]) => {
  // Only update if dropdown is closed and there's a selection
  if (!isOpen.value && newValue !== null) {
    const option = props.options.find((opt) => opt.value === newValue);
    searchQuery.value = option ? option.label : '';
  }
});

// Reset search query when dropdown closes
watch(isOpen, (newIsOpen) => {
  if (!newIsOpen) {
    if (selectedOption.value && props.modelValue !== null) {
      searchQuery.value = selectedOption.value.label;
    } else {
      searchQuery.value = '';
    }
  }
});

onMounted(() => {
  document.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside);
});
</script>
