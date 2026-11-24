<script setup>
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../../api.js';
import { wizard, toPayload, displayName } from '../../stores/wizard.js';
import { formatBudgetRange, formatDate } from '../../format.js';

const router = useRouter();
const submitting = ref(false);
const error = ref(null);

const nameByRef = computed(() => Object.fromEntries(wizard.participants.map((p, i) => [p.ref, displayName(p, i)])));
const restrictions = computed(() =>
  wizard.participants.flatMap((p, i) => p.exclusions.map((ref) => ({ from: displayName(p, i), to: nameByRef.value[ref] }))),
);

async function confirm() {
  submitting.value = true;
  error.value = null;
  try {
    const result = await api.createGroup(toPayload());
    wizard.created = { groupId: result.groupId, adminUrl: result.adminUrl, groupName: wizard.group.name, organizerEmail: wizard.group.organizerEmail };
    router.replace({ name: 'group-created' });
  } catch (err) {
    error.value = err;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto page-narrow">
    <div class="card-soft overflow-hidden">
      <div class="ribbon-header p-4 p-md-5">
        <div class="position-relative">
          <div class="small text-white-50 text-uppercase fw-semibold">Resumen</div>
          <h2 class="h3 mb-3">{{ wizard.group.name }}</h2>
          <div class="d-flex flex-wrap gap-2">
            <span class="badge rounded-pill bg-white text-primary px-3 py-2"><i class="bi bi-wallet2 me-1"></i>{{ formatBudgetRange(wizard.group.budgetMin, wizard.group.budgetMax, wizard.group.currency) }}</span>
            <span class="badge rounded-pill bg-white text-primary px-3 py-2"><i class="bi bi-people me-1"></i>{{ wizard.participants.length }} participantes</span>
            <span v-if="wizard.group.exchangeDate" class="badge rounded-pill bg-white text-primary px-3 py-2">
              <i class="bi bi-calendar-event me-1"></i>{{ formatDate(wizard.group.exchangeDate) }}
            </span>
          </div>
        </div>
      </div>

      <div class="p-4 p-md-5">
        <div class="mb-4">
          <h3 class="h6 text-uppercase text-secondary">Organizador</h3>
          <div>{{ wizard.group.organizerName }} · <span class="text-secondary">{{ wizard.group.organizerEmail }}</span></div>
        </div>

        <h3 class="h6 text-uppercase text-secondary">Participantes</h3>
        <ul class="list-group list-group-flush mb-4">
          <li v-for="(p, i) in wizard.participants" :key="p.ref" class="list-group-item px-0 d-flex justify-content-between flex-wrap gap-1">
            <span class="fw-semibold">{{ displayName(p, i) }}</span>
            <span class="text-secondary small text-break">{{ p.email }}</span>
          </li>
        </ul>

        <h3 class="h6 text-uppercase text-secondary">Restricciones</h3>
        <ul v-if="restrictions.length" class="list-unstyled mb-4">
          <li v-for="(r, i) in restrictions" :key="i" class="small py-1">
            <i class="bi bi-slash-circle text-danger me-1"></i><strong>{{ r.from }}</strong> no regalará a <strong>{{ r.to }}</strong>
          </li>
        </ul>
        <p v-else class="text-secondary small mb-4">Sin restricciones: cualquiera puede regalar a cualquiera.</p>

        <div class="alert alert-success d-flex gap-2 small mb-0">
          <i class="bi bi-envelope-check"></i>
          <div>Al confirmar, enviaremos a cada participante una invitación con un enlace personal (válido 72 horas) para indicar sus preferencias. El sorteo se hará automáticamente cuando todos respondan.</div>
        </div>

        <div v-if="error" class="alert alert-danger mt-3 mb-0" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ error.message }}
          <ul v-if="error.details?.length > 1" class="mb-0 mt-2 small">
            <li v-for="d in error.details" :key="d.path + d.message">{{ d.message }}</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="d-flex justify-content-between mt-4">
      <button type="button" class="btn btn-outline-secondary btn-lg" :disabled="submitting" @click="router.push({ name: 'create-participants' })">
        <i class="bi bi-arrow-left me-1"></i> Atrás
      </button>
      <button type="button" class="btn btn-pine btn-lg px-4" :disabled="submitting" @click="confirm">
        <span v-if="submitting" class="spinner-border spinner-border-sm me-2"></span>
        <i v-else class="bi bi-send me-2"></i>Crear y enviar invitaciones
      </button>
    </div>
  </div>
</template>
