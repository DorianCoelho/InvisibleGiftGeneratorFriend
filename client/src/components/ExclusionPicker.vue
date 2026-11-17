<script setup>
import { ref } from 'vue';

const props = defineProps({
  /** @type {{ id: string, label: string }[]} */
  options: { type: Array, required: true },
  selected: { type: Array, required: true },
  ownerLabel: { type: String, required: true },
  disabled: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle']);
const open = ref(props.selected.length > 0);
const isOn = (id) => props.selected.includes(id);
</script>

<template>
  <div class="exclusions">
    <button type="button" class="btn btn-sm btn-link text-decoration-none px-0" :aria-expanded="open" @click="open = !open">
      <i class="bi" :class="open ? 'bi-chevron-up' : 'bi-person-x'"></i>
      Restricciones
      <span v-if="selected.length" class="badge rounded-pill text-bg-danger ms-1">{{ selected.length }}</span>
    </button>
    <div v-if="open" class="mt-2">
      <div class="small text-secondary mb-2">{{ ownerLabel }} <strong>no</strong> podrá regalar a:</div>
      <div class="d-flex flex-wrap gap-2">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          class="chip"
          :class="{ on: isOn(opt.id) }"
          :aria-pressed="isOn(opt.id)"
          :disabled="disabled"
          @click="emit('toggle', opt.id)"
        >
          <i class="bi" :class="isOn(opt.id) ? 'bi-x-circle-fill' : 'bi-plus-circle'"></i>
          {{ opt.label }}
        </button>
        <span v-if="!options.length" class="small text-secondary">Añade más participantes.</span>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chip {
  border: 1px solid #e7dccd;
  background: #fff;
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: #475569;
  transition: all 0.15s;
  &:hover:not(:disabled) { border-color: var(--gift-red); }
  &.on {
    background: rgba(200, 16, 46, 0.08);
    border-color: var(--gift-red);
    color: var(--gift-red);
    font-weight: 600;
  }
}
</style>
