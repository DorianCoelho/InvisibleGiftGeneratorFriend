<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { wizard, validateGroupStep, syncParticipantRows, MIN_PARTICIPANTS, MAX_PARTICIPANTS } from '../../stores/wizard.js';
import { CURRENCY_SYMBOLS } from '../../format.js';

const router = useRouter();
const submitted = ref(false);
const errors = computed(() => (submitted.value ? validateGroupStep() : {}));
const today = new Date().toISOString().slice(0, 10);
const currencies = Object.keys(CURRENCY_SYMBOLS);

function changeCount(delta) {
  const next = Number(wizard.group.participantCount) + delta;
  wizard.group.participantCount = Math.min(MAX_PARTICIPANTS, Math.max(MIN_PARTICIPANTS, next));
}

function next() {
  submitted.value = true;
  if (Object.keys(validateGroupStep()).length > 0) {
    document.querySelector('.is-invalid')?.focus();
    return;
  }
  syncParticipantRows();
  router.push({ name: 'create-participants' });
}
</script>

<template>
  <form class="card-soft p-4 p-md-5 mx-auto page-narrow" novalidate @submit.prevent="next">
    <h2 class="h4 mb-1"><i class="bi bi-sliders text-primary me-2"></i>Configura el grupo</h2>
    <p class="text-secondary mb-4">Los datos básicos del intercambio.</p>

    <div class="row g-3">
      <div class="col-12">
        <label for="g-name" class="form-label">Nombre del grupo o evento</label>
        <input id="g-name" v-model="wizard.group.name" type="text" class="form-control form-control-lg" :class="{ 'is-invalid': errors.name }"
          maxlength="80" placeholder="Ej.: Navidad 2026 en familia" autocomplete="off" />
        <div class="invalid-feedback">{{ errors.name }}</div>
      </div>

      <div class="col-md-6">
        <label for="g-count" class="form-label">Número de participantes</label>
        <div class="input-group">
          <button type="button" class="btn btn-outline-secondary" aria-label="Quitar participante" @click="changeCount(-1)"><i class="bi bi-dash-lg"></i></button>
          <input id="g-count" v-model.number="wizard.group.participantCount" type="number" class="form-control text-center"
            :class="{ 'is-invalid': errors.participantCount }" :min="MIN_PARTICIPANTS" :max="MAX_PARTICIPANTS" inputmode="numeric" />
          <button type="button" class="btn btn-outline-secondary" aria-label="Añadir participante" @click="changeCount(1)"><i class="bi bi-plus-lg"></i></button>
          <div class="invalid-feedback">{{ errors.participantCount }}</div>
        </div>
        <div class="form-text">Si tú también participas, inclúyete en el número.</div>
      </div>

      <div class="col-md-6">
        <label for="g-budget" class="form-label">Presupuesto máximo por regalo</label>
        <div class="input-group">
          <input id="g-budget" v-model.number="wizard.group.budget" type="number" class="form-control" :class="{ 'is-invalid': errors.budget }"
            min="1" step="0.5" inputmode="decimal" />
          <select v-model="wizard.group.currency" class="form-select currency-select" aria-label="Moneda">
            <option v-for="c in currencies" :key="c" :value="c">{{ c }}</option>
          </select>
          <div class="invalid-feedback">{{ errors.budget }}</div>
        </div>
      </div>

      <div class="col-12">
        <label for="g-date" class="form-label">Fecha del intercambio <span class="text-secondary fw-normal">(opcional)</span></label>
        <input id="g-date" v-model="wizard.group.exchangeDate" type="date" class="form-control" :class="{ 'is-invalid': errors.exchangeDate }" :min="today" />
        <div class="invalid-feedback">{{ errors.exchangeDate }}</div>
      </div>
    </div>

    <hr class="my-4" />
    <h3 class="h6 text-uppercase text-secondary mb-3"><i class="bi bi-person-badge me-1"></i>Organizador</h3>
    <div class="row g-3">
      <div class="col-md-6">
        <label for="o-name" class="form-label">Tu nombre</label>
        <input id="o-name" v-model="wizard.group.organizerName" type="text" class="form-control" :class="{ 'is-invalid': errors.organizerName }"
          maxlength="60" autocomplete="name" />
        <div class="invalid-feedback">{{ errors.organizerName }}</div>
      </div>
      <div class="col-md-6">
        <label for="o-email" class="form-label">Tu correo electrónico</label>
        <input id="o-email" v-model="wizard.group.organizerEmail" type="email" class="form-control" :class="{ 'is-invalid': errors.organizerEmail }"
          maxlength="254" autocomplete="email" />
        <div class="invalid-feedback">{{ errors.organizerEmail }}</div>
        <div class="form-text">Aquí recibirás el enlace privado a tu panel.</div>
      </div>
    </div>

    <div class="honeypot" aria-hidden="true">
      <label>No rellenar <input v-model="wizard.website" type="text" tabindex="-1" autocomplete="off" /></label>
    </div>

    <div class="d-flex justify-content-end mt-4">
      <button type="submit" class="btn btn-primary btn-lg px-4">Siguiente <i class="bi bi-arrow-right ms-1"></i></button>
    </div>
  </form>
</template>

<style scoped>
.currency-select {
  max-width: 6.5rem;
}
</style>
