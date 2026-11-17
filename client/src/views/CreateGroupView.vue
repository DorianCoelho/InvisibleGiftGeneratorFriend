<script setup>
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import WizardProgress from '../components/wizard/WizardProgress.vue';

const route = useRoute();
const step = computed(() => route.meta.step ?? 1);
</script>

<template>
  <div class="container page-wide py-4 py-md-5">
    <div class="text-center mb-4">
      <h1 class="h2 mb-1">Crea tu Amigo Invisible</h1>
      <p class="text-secondary mb-0">Solo te llevará un par de minutos.</p>
    </div>
    <WizardProgress :current="step" />
    <RouterView v-slot="{ Component }">
      <Transition name="fade-up" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </div>
</template>
