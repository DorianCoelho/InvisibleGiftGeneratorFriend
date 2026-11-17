<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import LoadingState from '../components/LoadingState.vue';
import { api, linkErrorRoute, useLinkToken } from '../api.js';
import { formatDate, formatDateTime, formatMoney, timeLeft } from '../format.js';

const route = useRoute();
const router = useRouter();
const groupId = route.params.groupId;
const token = useLinkToken('participant', groupId);

const loading = ref(true);
const saving = ref(false);
const loadError = ref(null);
const saveError = ref(null);
const submitted = ref(false);
const session = ref(null);
const items = reactive([0, 1, 2].map(() => ({ name: '', description: '', url: '' })));

const isValidUrl = (value) => {
  if (!value.trim()) return true;
  try {
    const u = new URL(value.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
};

const itemErrors = computed(() =>
  items.map((item) => {
    const e = {};
    if (item.name.trim().length < 2) e.name = 'Indica qué te gustaría recibir.';
    if (item.description.length > 500) e.description = 'Máximo 500 caracteres.';
    if (!isValidUrl(item.url)) e.url = 'Introduce un enlace válido que empiece por https://';
    return e;
  }),
);
const shownErrors = computed(() => (submitted.value ? itemErrors.value : [{}, {}, {}]));
const completedCount = computed(() => items.filter((i) => i.name.trim().length >= 2).length);

async function load() {
  if (!token) return router.replace({ name: 'invalid-link', query: { motivo: 'invalido' } });
  try {
    session.value = await api.participantSession(groupId, token);
    if (session.value.drawDone) return router.replace({ name: 'draw-done', params: { groupId } });
    session.value.preferences?.items.forEach((item, i) => Object.assign(items[i], { description: '', url: '', ...item }));
  } catch (err) {
    const target = linkErrorRoute(err, groupId);
    if (target) return router.replace(target);
    loadError.value = err;
  } finally {
    loading.value = false;
  }
}

async function save() {
  submitted.value = true;
  saveError.value = null;
  if (itemErrors.value.some((e) => Object.keys(e).length)) {
    setTimeout(() => document.querySelector('.is-invalid')?.focus());
    return;
  }
  saving.value = true;
  try {
    const result = await api.savePreferences(
      groupId,
      token,
      items.map((i) => ({ name: i.name.trim(), description: i.description.trim(), url: i.url.trim() })),
    );
    router.push({ name: 'preferences-saved', params: { groupId }, query: { sorteo: result.drawDone ? '1' : undefined } });
  } catch (err) {
    const target = linkErrorRoute(err, groupId);
    if (target) return router.replace(target);
    if (err.code === 'draw_done') return router.replace({ name: 'draw-done', params: { groupId } });
    saveError.value = err;
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="container page-narrow py-4 py-md-5">
    <LoadingState v-if="loading" text="Abriendo tu invitación…" />

    <div v-else-if="loadError" class="alert alert-danger">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ loadError.message }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="(loading = true), (loadError = null), load()">Reintentar</button>
    </div>

    <template v-else-if="session">
      <div class="card-soft overflow-hidden mb-4">
        <div class="ribbon-header p-4 p-md-5">
          <div class="position-relative">
            <div class="small text-white-50 fw-semibold text-uppercase">{{ session.group.name }}</div>
            <h1 class="h2 mb-2">¡Hola, {{ session.participant.name }}! 🎁</h1>
            <p class="mb-0 text-white-50">{{ session.group.organizerName }} te ha invitado al Amigo Invisible. ¿Qué te gustaría recibir?</p>
          </div>
        </div>
        <div class="p-3 px-md-5 d-flex flex-wrap gap-2 align-items-center justify-content-between">
          <span class="budget-pill"><i class="bi bi-wallet2"></i> Presupuesto máximo: {{ formatMoney(session.group.budget, session.group.currency) }}</span>
          <span v-if="session.group.exchangeDate" class="small text-secondary"><i class="bi bi-calendar-event me-1"></i>{{ formatDate(session.group.exchangeDate) }}</span>
        </div>
      </div>

      <div v-if="session.preferences" class="alert alert-success d-flex gap-2 small">
        <i class="bi bi-check-circle-fill"></i>
        <div>Ya guardaste tus preferencias el {{ formatDateTime(session.preferences.updatedAt) }}. Puedes modificarlas hasta que se realice el sorteo.</div>
      </div>

      <form novalidate @submit.prevent="save">
        <div class="d-flex flex-column gap-3">
          <fieldset v-for="(item, i) in items" :key="i" class="card-soft p-4 gift-card" :class="{ filled: item.name.trim().length >= 2 }">
            <legend class="h5 d-flex align-items-center gap-2 mb-3 float-none w-auto">
              <span class="gift-number">{{ i + 1 }}</span> Regalo {{ i + 1 }}
            </legend>
            <div class="mb-3">
              <label :for="`item-name-${i}`" class="form-label">¿Qué te gustaría?</label>
              <input :id="`item-name-${i}`" v-model="item.name" type="text" class="form-control" :class="{ 'is-invalid': shownErrors[i].name }"
                maxlength="120" :placeholder="['Ej.: Un libro de cocina italiana', 'Ej.: Una taza personalizada', 'Ej.: Una tarjeta regalo'][i]" />
              <div class="invalid-feedback">{{ shownErrors[i].name }}</div>
            </div>
            <div class="mb-3">
              <label :for="`item-desc-${i}`" class="form-label">Descripción <span class="text-secondary fw-normal">(opcional)</span></label>
              <textarea :id="`item-desc-${i}`" v-model="item.description" rows="2" class="form-control" :class="{ 'is-invalid': shownErrors[i].description }"
                maxlength="500" placeholder="Talla, color, autor, algo que ayude a acertar…"></textarea>
              <div class="invalid-feedback">{{ shownErrors[i].description }}</div>
            </div>
            <div>
              <label :for="`item-url-${i}`" class="form-label">Enlace a tienda o producto <span class="text-secondary fw-normal">(opcional)</span></label>
              <div class="input-group has-validation">
                <span class="input-group-text"><i class="bi bi-link-45deg"></i></span>
                <input :id="`item-url-${i}`" v-model="item.url" type="url" class="form-control" :class="{ 'is-invalid': shownErrors[i].url }"
                  maxlength="500" placeholder="https://" inputmode="url" />
                <div class="invalid-feedback">{{ shownErrors[i].url }}</div>
              </div>
            </div>
          </fieldset>
        </div>

        <div v-if="saveError" class="alert alert-danger mt-3" role="alert">
          <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ saveError.message }}
        </div>

        <div class="sticky-save mt-4">
          <div class="card-soft p-3 d-flex flex-wrap gap-2 align-items-center justify-content-between">
            <div class="small text-secondary">
              <i class="bi bi-list-check me-1"></i>{{ completedCount }}/3 regalos ·
              <i class="bi bi-hourglass-split ms-1 me-1"></i>tu enlace caduca en {{ timeLeft(session.link.expiresAt) }}
            </div>
            <button type="submit" class="btn btn-pine btn-lg px-4" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="bi bi-heart-fill me-2"></i>Guardar mis preferencias
            </button>
          </div>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
.gift-card {
  border-left: 4px solid #e7dccd;
  transition: border-color 0.2s;
}
.gift-card.filled {
  border-left-color: var(--pine);
}
.gift-number {
  width: 2rem;
  height: 2rem;
  border-radius: 0.6rem;
  background: var(--gift-red);
  color: #fff;
  font-size: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.sticky-save {
  position: sticky;
  bottom: 1rem;
  z-index: 10;
}
</style>
