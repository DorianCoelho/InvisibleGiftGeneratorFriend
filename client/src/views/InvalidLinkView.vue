<script setup>
import { computed } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

const route = useRoute();
const content = computed(() => {
  if (route.name === 'not-found') {
    return { icon: 'bi-signpost-split', title: 'Página no encontrada', text: 'La página que buscas no existe o se ha movido.' };
  }
  if (route.query.motivo === 'caducado') {
    return {
      icon: 'bi-hourglass-bottom',
      title: 'Tu enlace ha caducado',
      text: 'Por seguridad, los enlaces de invitación solo son válidos durante 72 horas. Pide al organizador del grupo que te envíe una nueva invitación desde su panel.',
    };
  }
  return {
    icon: 'bi-link-45deg',
    title: 'Enlace no válido',
    text: 'Este enlace no es válido o ya no existe. Puede que se haya enviado una invitación más reciente (que invalida las anteriores) o que el grupo se haya eliminado. Si crees que es un error, contacta con el organizador.',
  };
});
</script>

<template>
  <div class="container page-narrow py-5">
    <div class="card-soft p-4 p-md-5 text-center">
      <span class="icon-bubble bg-light text-primary mb-3" style="width: 4.5rem; height: 4.5rem; font-size: 2rem">
        <i class="bi" :class="content.icon"></i>
      </span>
      <h1 class="h2">{{ content.title }}</h1>
      <p class="text-secondary mx-auto" style="max-width: 32rem">{{ content.text }}</p>
      <div class="d-flex flex-column flex-sm-row gap-2 justify-content-center mt-4">
        <RouterLink to="/" class="btn btn-outline-secondary">Ir al inicio</RouterLink>
        <RouterLink :to="{ name: 'create-group' }" class="btn btn-primary"><i class="bi bi-gift me-1"></i>Crear un grupo nuevo</RouterLink>
      </div>
    </div>
  </div>
</template>
