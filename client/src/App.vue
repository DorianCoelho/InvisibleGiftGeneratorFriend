<script setup>
import { computed } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();
// En preferencias la URL cambia con el token de cada persona: hay que remontar
// la página para no reutilizar el formulario de quien respondió antes.
const viewKey = computed(() => (route.name === 'preferences' ? route.fullPath : (route.matched[0]?.path ?? route.path)));
</script>

<template>
  <header class="app-header">
    <nav class="container page-wide d-flex align-items-center justify-content-between py-3">
      <RouterLink to="/" class="brand text-decoration-none d-flex align-items-center gap-2">
        <span class="brand-icon"><i class="bi bi-gift-fill"></i></span>
        <span class="brand-text">Amigo Invisible</span>
      </RouterLink>
      <RouterLink :to="{ name: 'create-group' }" class="btn btn-primary btn-sm px-3">
        <i class="bi bi-plus-lg me-1"></i><span class="d-none d-sm-inline">Nuevo </span>grupo
      </RouterLink>
    </nav>
  </header>

  <main class="flex-grow-1 pb-5">
    <RouterView v-slot="{ Component }">
      <Transition name="fade-up" mode="out-in">
        <component :is="Component" :key="viewKey" />
      </Transition>
    </RouterView>
  </main>

  <footer class="app-footer py-4 mt-auto">
    <div class="container page-wide d-flex flex-column flex-sm-row gap-2 justify-content-between small text-secondary">
      <span><i class="bi bi-shield-lock me-1"></i>Sin registros. Tus datos se eliminan al terminar el sorteo.</span>
      <span>Hecho con <i class="bi bi-heart-fill text-primary"></i> para regalar mejor</span>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.app-header {
  background: rgba(255, 248, 239, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #f1e6d8;
  position: sticky;
  top: 0;
  z-index: 100;
}
.brand-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.7rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--gift-red);
  color: #fff;
  font-size: 1.1rem;
  transform: rotate(-6deg);
}
.brand-text {
  font-family: 'Fraunces Variable', Georgia, serif;
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--ink);
}
.app-footer {
  border-top: 1px solid #f1e6d8;
}
</style>
