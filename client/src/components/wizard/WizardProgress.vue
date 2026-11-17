<script setup>
defineProps({ current: { type: Number, required: true } });

const steps = [
  { n: 1, label: 'Grupo', icon: 'bi-sliders' },
  { n: 2, label: 'Participantes', icon: 'bi-people' },
  { n: 3, label: 'Confirmar', icon: 'bi-check2-circle' },
];
</script>

<template>
  <ol class="wizard-progress list-unstyled d-flex justify-content-center align-items-start mx-auto mb-4 mb-md-5" aria-label="Progreso">
    <template v-for="(s, i) in steps" :key="s.n">
      <li class="step" :class="{ done: s.n < current, active: s.n === current }" :aria-current="s.n === current ? 'step' : undefined">
        <span class="dot">
          <i v-if="s.n < current" class="bi bi-check-lg"></i>
          <i v-else class="bi" :class="s.icon"></i>
        </span>
        <span class="label">{{ s.label }}</span>
      </li>
      <li v-if="i < steps.length - 1" class="bar" :class="{ done: s.n < current }" aria-hidden="true"></li>
    </template>
  </ol>
</template>

<style scoped lang="scss">
.wizard-progress {
  max-width: 520px;
}
.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  min-width: 84px;
}
.dot {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #e7dccd;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.15rem;
  transition: all 0.2s;
}
.label {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
}
.step.active .dot {
  background: var(--gift-red);
  border-color: var(--gift-red);
  color: #fff;
  box-shadow: 0 0 0 6px rgba(200, 16, 46, 0.15);
}
.step.active .label { color: var(--ink); }
.step.done .dot {
  background: var(--pine);
  border-color: var(--pine);
  color: #fff;
}
.step.done .label { color: var(--pine); }
.bar {
  flex: 1;
  height: 3px;
  background: #e7dccd;
  margin-top: 1.35rem;
  border-radius: 3px;
}
.bar.done { background: var(--pine); }
</style>
