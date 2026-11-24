<script setup>
import { computed, onMounted, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import LoadingState from '../components/LoadingState.vue';
import { api, linkErrorRoute, useLinkToken } from '../api.js';
import { formatBudgetRange } from '../format.js';

const route = useRoute();
const router = useRouter();
const groupId = route.params.groupId;
const token = useLinkToken('participant', groupId);
const session = ref(null);
const loading = ref(true);

const percent = computed(() => (session.value ? Math.round((session.value.progress.completed / session.value.progress.total) * 100) : 0));
const pending = computed(() => (session.value ? session.value.progress.total - session.value.progress.completed : 0));

onMounted(async () => {
  if (route.query.sorteo === '1') return router.replace({ name: 'draw-done', params: { groupId } });
  try {
    session.value = await api.participantSession(groupId, token);
    if (session.value.drawDone) return router.replace({ name: 'draw-done', params: { groupId } });
  } catch (err) {
    const target = linkErrorRoute(err, groupId);
    if (target) return router.replace(target);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="container page-narrow py-5">
    <LoadingState v-if="loading" />
    <div v-else class="card-soft p-4 p-md-5 text-center">
      <div class="display-3 mb-2" aria-hidden="true">💌</div>
      <h1 class="h2">¡Preferencias guardadas!</h1>
      <p class="lead text-secondary">Gracias. Ya has completado tu parte del Amigo Invisible.</p>

      <template v-if="session">
        <div class="text-start my-4">
          <div class="d-flex justify-content-between small fw-semibold mb-1">
            <span>Participantes que ya han respondido</span>
            <span>{{ session.progress.completed }}/{{ session.progress.total }}</span>
          </div>
          <div class="progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" style="height: 0.8rem">
            <div class="progress-bar bg-success" :style="{ width: `${percent}%` }"></div>
          </div>
        </div>
        <p class="text-secondary">
          <i class="bi bi-hourglass-split me-1"></i>
          Faltan {{ pending }} {{ pending === 1 ? 'persona' : 'personas' }}. Cuando todos respondan haremos el sorteo automáticamente y te
          enviaremos por correo a quién te ha tocado regalar (presupuesto {{ formatBudgetRange(session.group.budgetMin, session.group.budgetMax, session.group.currency) }}).
        </p>
      </template>

      <div class="d-flex flex-column flex-sm-row gap-2 justify-content-center mt-4">
        <RouterLink :to="{ name: 'preferences', params: { groupId } }" class="btn btn-outline-secondary">
          <i class="bi bi-pencil me-1"></i>Modificar mis preferencias
        </RouterLink>
      </div>
    </div>
  </div>
</template>
