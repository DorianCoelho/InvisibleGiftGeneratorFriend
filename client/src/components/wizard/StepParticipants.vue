<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import ExclusionPicker from '../ExclusionPicker.vue';
import { wizard, validateParticipantsStep, syncParticipantRows, toggleExclusion, displayName } from '../../stores/wizard.js';

const router = useRouter();
const submitted = ref(false);
const validation = computed(() => validateParticipantsStep());
const fieldErrors = computed(() => (submitted.value ? validation.value.fields : {}));
const restrictionCount = computed(() => wizard.participants.reduce((n, p) => n + p.exclusions.length, 0));

onMounted(syncParticipantRows);

const optionsFor = (participant) =>
  wizard.participants
    .map((p, i) => ({ id: p.ref, label: displayName(p, i) }))
    .filter((o) => o.id !== participant.ref);

function next() {
  submitted.value = true;
  const { fields, general } = validation.value;
  if (Object.keys(fields).length || general.length) {
    setTimeout(() => document.querySelector('.is-invalid, .alert-danger')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    return;
  }
  router.push({ name: 'create-confirm' });
}
</script>

<template>
  <form class="mx-auto page-narrow" novalidate @submit.prevent="next">
    <div class="card-soft p-4 p-md-5">
      <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-4">
        <div>
          <h2 class="h4 mb-1"><i class="bi bi-people text-primary me-2"></i>Añade a los participantes</h2>
          <p class="text-secondary mb-0">{{ wizard.participants.length }} personas · {{ restrictionCount }} restricciones</p>
        </div>
        <div class="form-check form-switch mt-1">
          <input id="reciprocal" v-model="wizard.reciprocal" class="form-check-input" type="checkbox" role="switch" />
          <label class="form-check-label small" for="reciprocal">Restricciones recíprocas</label>
        </div>
      </div>

      <div class="alert alert-light border small d-flex gap-2">
        <i class="bi bi-lightbulb text-gold"></i>
        <div>
          Usa las <strong>restricciones</strong> para evitar que alguien regale a una persona concreta (por ejemplo, parejas).
          Con las restricciones recíprocas activadas, si Pedro no puede regalar a María, María tampoco podrá regalar a Pedro.
        </div>
      </div>

      <TransitionGroup tag="ol" name="fade-up" class="list-unstyled d-flex flex-column gap-3 mb-0">
        <li v-for="(p, i) in wizard.participants" :key="p.ref" class="participant-row p-3">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="avatar">{{ (p.name.trim()[0] || i + 1).toString().toUpperCase() }}</span>
            <span class="fw-semibold">{{ displayName(p, i) }}</span>
          </div>
          <div class="row g-2">
            <div class="col-md-5">
              <label :for="`p-name-${i}`" class="visually-hidden">Nombre del participante {{ i + 1 }}</label>
              <input :id="`p-name-${i}`" v-model="p.name" type="text" class="form-control" :class="{ 'is-invalid': fieldErrors[p.ref]?.name }"
                placeholder="Nombre" maxlength="60" autocomplete="off" />
              <div class="invalid-feedback">{{ fieldErrors[p.ref]?.name }}</div>
            </div>
            <div class="col-md-7">
              <label :for="`p-email-${i}`" class="visually-hidden">Correo del participante {{ i + 1 }}</label>
              <input :id="`p-email-${i}`" v-model="p.email" type="email" class="form-control" :class="{ 'is-invalid': fieldErrors[p.ref]?.email }"
                placeholder="correo@ejemplo.com" maxlength="254" autocomplete="off" />
              <div class="invalid-feedback">{{ fieldErrors[p.ref]?.email }}</div>
            </div>
          </div>
          <ExclusionPicker
            class="mt-2"
            :options="optionsFor(p)"
            :selected="p.exclusions"
            :owner-label="displayName(p, i)"
            @toggle="(ref) => toggleExclusion(p, ref)"
          />
        </li>
      </TransitionGroup>

      <div v-for="msg in validation.general" :key="msg" class="alert alert-danger d-flex gap-2 mt-4 mb-0" role="alert">
        <i class="bi bi-exclamation-triangle-fill"></i><div>{{ msg }}</div>
      </div>
    </div>

    <div class="d-flex justify-content-between mt-4">
      <button type="button" class="btn btn-outline-secondary btn-lg" @click="router.push({ name: 'create-group' })">
        <i class="bi bi-arrow-left me-1"></i> Atrás
      </button>
      <button type="submit" class="btn btn-primary btn-lg px-4">Siguiente <i class="bi bi-arrow-right ms-1"></i></button>
    </div>
  </form>
</template>

<style scoped>
.participant-row {
  border: 1px solid #f1e6d8;
  border-radius: 1rem;
  background: #fffdf9;
}
.avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--pine);
  color: #fff;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
</style>
