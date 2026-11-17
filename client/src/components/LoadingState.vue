<script setup>
defineProps({ text: { type: String, default: 'Cargando…' } });
</script>

<template>
  <div class="d-flex flex-column align-items-center justify-content-center py-5 text-secondary" role="status">
    <i class="bi bi-gift-fill text-primary fs-1 bounce" aria-hidden="true"></i>
    <span class="mt-2">{{ text }}</span>
  </div>
</template>

<style scoped>
.bounce {
  animation: bounce 1s ease-in-out infinite;
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
</style>
