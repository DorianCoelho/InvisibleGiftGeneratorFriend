<script setup>
import { onMounted } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { forgetLinkToken } from '../api.js';

const route = useRoute();
onMounted(() => {
  if (route.params.groupId) forgetLinkToken('participant', route.params.groupId);
});

const confetti = Array.from({ length: 24 }, (_, i) => ({
  left: `${(i * 37) % 100}%`,
  delay: `${(i % 8) * 0.35}s`,
  color: ['#c8102e', '#14532d', '#d4a017', '#0e7490'][i % 4],
}));
</script>

<template>
  <div class="container page-narrow py-5 position-relative">
    <div class="confetti" aria-hidden="true">
      <span v-for="(c, i) in confetti" :key="i" :style="{ left: c.left, animationDelay: c.delay, background: c.color }"></span>
    </div>
    <div class="card-soft p-4 p-md-5 text-center position-relative">
      <div class="display-2 mb-2" aria-hidden="true">🎅</div>
      <h1 class="h2">¡El sorteo ya se ha realizado!</h1>
      <p class="lead text-secondary">
        Revisa tu bandeja de entrada: te hemos enviado un correo con el nombre de la persona a la que te toca regalar y sus tres ideas de regalo.
      </p>
      <div class="alert alert-light border text-start small d-flex gap-2 mt-4">
        <i class="bi bi-envelope-paper-heart text-primary fs-5"></i>
        <div>
          ¿No lo encuentras? Mira en la carpeta de <strong>spam</strong> o <strong>promociones</strong>. Si sigue sin aparecer, pide al organizador que
          reintente el envío desde su panel.
        </div>
      </div>
      <p class="fs-5 mt-4 mb-4">🤫 <strong>¡Recuerda mantenerlo en secreto!</strong></p>
      <RouterLink to="/" class="btn btn-outline-secondary">Volver al inicio</RouterLink>
    </div>
  </div>
</template>

<style scoped>
.confetti {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.confetti span {
  position: absolute;
  top: -20px;
  width: 8px;
  height: 14px;
  border-radius: 2px;
  opacity: 0.8;
  animation: fall 3.2s linear infinite;
}
@keyframes fall {
  to { transform: translateY(520px) rotate(540deg); opacity: 0; }
}
</style>
