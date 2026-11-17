<script setup>
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import { wizard, resetWizard } from '../stores/wizard.js';

const created = { ...wizard.created };
const copied = ref(false);
const adminPath = new URL(created.adminUrl).pathname + new URL(created.adminUrl).hash;

async function copy() {
  try {
    await navigator.clipboard.writeText(created.adminUrl);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2500);
  } catch {
    /* el usuario puede copiarlo manualmente */
  }
}

// El asistente ya no es necesario: se limpia, pero mantenemos los datos de esta pantalla.
resetWizard();
wizard.created = created;
</script>

<template>
  <div class="container page-narrow py-5">
    <div class="card-soft p-4 p-md-5 text-center">
      <div class="celebrate mb-3" aria-hidden="true">🎉</div>
      <h1 class="h2">¡Grupo creado!</h1>
      <p class="lead text-secondary">
        Estamos enviando las invitaciones de <strong>{{ created.groupName }}</strong>. Cada participante recibirá un correo con su enlace personal.
      </p>

      <div class="text-start mt-4">
        <label for="admin-url" class="form-label"><i class="bi bi-key-fill text-gold me-1"></i>Tu enlace privado de organizador</label>
        <div class="input-group">
          <input id="admin-url" :value="created.adminUrl" class="form-control font-monospace small" readonly @focus="$event.target.select()" />
          <button type="button" class="btn" :class="copied ? 'btn-success' : 'btn-outline-secondary'" @click="copy">
            <i class="bi" :class="copied ? 'bi-check-lg' : 'bi-clipboard'"></i> {{ copied ? 'Copiado' : 'Copiar' }}
          </button>
        </div>
        <div class="alert alert-warning small mt-3 d-flex gap-2">
          <i class="bi bi-exclamation-triangle-fill"></i>
          <div>
            <strong>Guarda este enlace.</strong> Es la única forma de acceder al panel y no se puede recuperar. También te lo hemos enviado a
            <strong>{{ created.organizerEmail }}</strong>. No lo compartas.
          </div>
        </div>
      </div>

      <div class="d-flex flex-column flex-sm-row gap-2 justify-content-center mt-3">
        <a :href="adminPath" class="btn btn-primary btn-lg"><i class="bi bi-speedometer2 me-2"></i>Ir a mi panel</a>
        <RouterLink to="/" class="btn btn-outline-secondary btn-lg">Volver al inicio</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.celebrate {
  font-size: 4rem;
  animation: pop 0.6s ease-out;
}
@keyframes pop {
  0% { transform: scale(0.3); opacity: 0; }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); opacity: 1; }
}
</style>
