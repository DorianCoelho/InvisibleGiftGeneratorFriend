<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';
import { analyzeDraw } from '@amigo-invisible/shared/draw';
import ExclusionPicker from '../components/ExclusionPicker.vue';
import LoadingState from '../components/LoadingState.vue';
import { api, forgetLinkToken, linkErrorRoute, useLinkToken } from '../api.js';
import { formatDate, formatDateTime, formatMoney, timeLeft } from '../format.js';

const route = useRoute();
const router = useRouter();
const groupId = route.params.groupId;
const token = useLinkToken('admin', groupId);

const view = ref(null);
const loading = ref(true);
const error = ref(null);
const notice = ref(null);
const busy = reactive({ resendAll: false, retry: false, row: null, restrictions: false, delete: false });

const STATUS = {
  collecting: { label: 'Recogiendo preferencias', cls: 'text-bg-warning', icon: 'bi-hourglass-split' },
  draw_failed: { label: 'Sorteo bloqueado', cls: 'text-bg-danger', icon: 'bi-exclamation-octagon' },
  drawn: { label: 'Sorteo realizado', cls: 'text-bg-success', icon: 'bi-check2-all' },
  completed: { label: 'Completado', cls: 'text-bg-success', icon: 'bi-trophy' },
};
const INVITATION = {
  pending: { label: 'En cola', cls: 'text-bg-light border' },
  sending: { label: 'Enviando…', cls: 'text-bg-info' },
  sent: { label: 'Enviada', cls: 'text-bg-success' },
  failed: { label: 'Error de envío', cls: 'text-bg-danger' },
};
const RESULT = {
  pending: { label: 'Pendiente', cls: 'text-bg-light border' },
  sending: { label: 'Enviando…', cls: 'text-bg-info' },
  sent: { label: 'Entregado', cls: 'text-bg-success' },
  failed: { label: 'Fallido', cls: 'text-bg-danger' },
};

const group = computed(() => view.value?.group);
const isCollecting = computed(() => ['collecting', 'draw_failed'].includes(group.value?.status));
const percent = computed(() => (view.value?.summary ? Math.round((view.value.summary.completed / view.value.summary.total) * 100) : 0));
const pendingParticipants = computed(() => view.value?.participants.filter((p) => !p.hasPreferences) ?? []);
const failedResults = computed(() => view.value?.participants.filter((p) => p.resultEmail?.status === 'failed') ?? []);
const nameById = computed(() => Object.fromEntries((view.value?.participants ?? []).map((p) => [p.id, p.name])));

async function load({ silent = false } = {}) {
  if (!token) return router.replace({ name: 'invalid-link', query: { motivo: 'invalido' } });
  if (!silent) loading.value = true;
  try {
    view.value = await api.adminView(groupId, token);
    error.value = null;
    if (!editor.open && view.value.participants) resetEditor();
  } catch (err) {
    const target = linkErrorRoute(err, groupId);
    if (target && !silent) return router.replace(target);
    if (!silent) error.value = err;
  } finally {
    loading.value = false;
  }
}

function flash(type, text) {
  notice.value = { type, text };
  setTimeout(() => {
    if (notice.value?.text === text) notice.value = null;
  }, 6000);
}

async function resend(participantIds) {
  const key = participantIds ? 'row' : 'resendAll';
  busy[key] = participantIds ? participantIds[0] : true;
  try {
    const result = await api.resendInvitations(groupId, token, participantIds);
    const parts = [];
    if (result.queued.length) parts.push(`Enviando ${result.queued.length} ${result.queued.length === 1 ? 'invitación nueva' : 'invitaciones nuevas'} (válidas ${view.value.invitationTtlHours} h).`);
    if (result.skipped.length) parts.push(`${result.skipped.length} omitida(s): se enviaron hace menos de ${view.value.resendCooldownMinutes} min.`);
    flash(result.queued.length ? 'success' : 'warning', parts.join(' ') || 'No hay participantes pendientes.');
    setTimeout(() => load({ silent: true }), 1500);
  } catch (err) {
    flash('danger', err.message);
  } finally {
    busy[key] = key === 'row' ? null : false;
  }
}

async function retryResults() {
  busy.retry = true;
  try {
    await api.retryResults(groupId, token);
    flash('success', 'Reintentando los envíos fallidos. El sorteo no se repite.');
    setTimeout(() => load({ silent: true }), 2000);
  } catch (err) {
    flash('danger', err.message);
  } finally {
    busy.retry = false;
  }
}

// --- Editor de restricciones ---
const editor = reactive({ open: false, reciprocal: true, exclusions: {} });
function resetEditor() {
  editor.exclusions = Object.fromEntries(view.value.participants.map((p) => [p.id, [...p.exclusions]]));
}
function toggle(ownerId, otherId) {
  const set = (id, target, on) => {
    const list = editor.exclusions[id];
    const i = list.indexOf(target);
    if (on && i === -1) list.push(target);
    if (!on && i !== -1) list.splice(i, 1);
  };
  const on = !editor.exclusions[ownerId].includes(otherId);
  set(ownerId, otherId, on);
  if (editor.reciprocal) set(otherId, ownerId, on);
}
const editorAnalysis = computed(() =>
  view.value?.participants ? analyzeDraw(view.value.participants.map((p) => ({ id: p.id, exclusions: editor.exclusions[p.id] ?? [] }))) : { possible: true, blockedIds: [] },
);
async function saveRestrictions() {
  busy.restrictions = true;
  try {
    const result = await api.updateRestrictions(groupId, token, editor.exclusions);
    editor.open = false;
    flash('success', result.drawStatus === 'drawn' ? '¡Restricciones guardadas y sorteo realizado!' : 'Restricciones guardadas.');
    await load({ silent: true });
  } catch (err) {
    flash('danger', err.message);
  } finally {
    busy.restrictions = false;
  }
}

// --- Eliminación ---
const confirmName = ref('');
async function deleteGroup() {
  busy.delete = true;
  try {
    await api.deleteGroup(groupId, token);
    forgetLinkToken('admin', groupId);
    view.value = { deleted: true };
  } catch (err) {
    flash('danger', err.message);
  } finally {
    busy.delete = false;
  }
}

let timer;
onMounted(() => {
  load();
  timer = setInterval(() => {
    if (document.visibilityState === 'visible' && view.value?.group && !editor.open) load({ silent: true });
  }, 20000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <div class="container page-wide py-4 py-md-5">
    <LoadingState v-if="loading" text="Cargando tu panel…" />

    <div v-else-if="error" class="alert alert-danger">
      <i class="bi bi-exclamation-triangle-fill me-1"></i>{{ error.message }}
      <button class="btn btn-sm btn-outline-danger ms-2" @click="load()">Reintentar</button>
    </div>

    <!-- Grupo eliminado por el organizador -->
    <div v-else-if="view?.deleted" class="card-soft p-5 text-center page-narrow mx-auto">
      <i class="bi bi-trash3 display-4 text-secondary"></i>
      <h1 class="h3 mt-3">Grupo eliminado</h1>
      <p class="text-secondary">Se han borrado todos los datos del grupo, incluidas las copias de seguridad.</p>
      <RouterLink to="/" class="btn btn-primary">Volver al inicio</RouterLink>
    </div>

    <!-- Grupo completado y datos eliminados -->
    <div v-else-if="view?.completed" class="card-soft p-5 text-center page-narrow mx-auto">
      <div class="display-3">🎄</div>
      <h1 class="h3 mt-2">¡Sorteo completado!</h1>
      <p class="text-secondary">
        Los {{ view.participantCount }} participantes recibieron su Amigo Invisible el {{ formatDateTime(view.completedAt) }}.
        Para proteger la privacidad, los datos del grupo se eliminaron automáticamente.
      </p>
      <RouterLink :to="{ name: 'create-group' }" class="btn btn-primary"><i class="bi bi-gift me-1"></i>Organizar otro</RouterLink>
    </div>

    <template v-else-if="group">
      <!-- Cabecera -->
      <div class="card-soft overflow-hidden mb-4">
        <div class="ribbon-header p-4 p-md-5">
          <div class="position-relative d-flex flex-wrap justify-content-between gap-3">
            <div>
              <div class="small text-white-50 text-uppercase fw-semibold"><i class="bi bi-speedometer2 me-1"></i>Panel del organizador</div>
              <h1 class="h2 mb-2">{{ group.name }}</h1>
              <div class="d-flex flex-wrap gap-2">
                <span class="badge rounded-pill bg-white text-primary px-3 py-2"><i class="bi bi-wallet2 me-1"></i>Máx. {{ formatMoney(group.budget, group.currency) }}</span>
                <span v-if="group.exchangeDate" class="badge rounded-pill bg-white text-primary px-3 py-2">
                  <i class="bi bi-calendar-event me-1"></i>{{ formatDate(group.exchangeDate) }}
                </span>
              </div>
            </div>
            <div>
              <span class="badge fs-6 px-3 py-2" :class="STATUS[group.status].cls">
                <i class="bi me-1" :class="STATUS[group.status].icon"></i>{{ STATUS[group.status].label }}
              </span>
            </div>
          </div>
        </div>

        <div class="row g-0 text-center stats">
          <div class="col-6 col-md-3 p-3"><div class="stat">{{ view.summary.total }}</div><div class="small text-secondary">Participantes</div></div>
          <div class="col-6 col-md-3 p-3"><div class="stat text-success">{{ view.summary.completed }}</div><div class="small text-secondary">Completados</div></div>
          <div class="col-6 col-md-3 p-3"><div class="stat text-warning">{{ view.summary.pending }}</div><div class="small text-secondary">Pendientes</div></div>
          <div class="col-6 col-md-3 p-3">
            <div class="stat"><i class="bi" :class="group.drawnAt ? 'bi-check-circle-fill text-success' : 'bi-hourglass text-secondary'"></i></div>
            <div class="small text-secondary">{{ group.drawnAt ? `Sorteado ${formatDateTime(group.drawnAt)}` : 'Sorteo pendiente' }}</div>
          </div>
        </div>
        <div class="px-4 pb-4">
          <div class="progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100" style="height: 0.7rem">
            <div class="progress-bar bg-success" :style="{ width: `${percent}%` }"></div>
          </div>
        </div>
      </div>

      <Transition name="fade-up">
        <div v-if="notice" class="alert" :class="`alert-${notice.type}`" role="status">{{ notice.text }}</div>
      </Transition>

      <div v-if="group.status === 'draw_failed'" class="alert alert-danger d-flex flex-wrap gap-3 align-items-center">
        <i class="bi bi-exclamation-octagon-fill fs-4"></i>
        <div class="flex-grow-1">
          <strong>No se ha podido realizar el sorteo.</strong> Con las restricciones actuales no existe ninguna combinación válida. Modifícalas y el sorteo se hará automáticamente.
        </div>
        <button class="btn btn-danger" @click="editor.open = true">Editar restricciones</button>
      </div>

      <div v-if="group.status === 'drawn'" class="alert alert-success d-flex gap-2">
        <i class="bi bi-envelope-check-fill"></i>
        <div>
          El sorteo se ha realizado y se están enviando los resultados.
          <span v-if="view.deleteGroupWhenCompleted">Cuando todos los correos se entreguen, los datos del grupo se eliminarán automáticamente.</span>
        </div>
      </div>

      <!-- Acciones -->
      <div class="d-flex flex-wrap gap-2 mb-3">
        <button v-if="isCollecting" class="btn btn-primary" :disabled="busy.resendAll || !pendingParticipants.length" @click="resend()">
          <span v-if="busy.resendAll" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="bi bi-send me-1"></i>Reenviar a pendientes ({{ pendingParticipants.length }})
        </button>
        <button v-if="failedResults.length" class="btn btn-gold" :disabled="busy.retry || view.sendingResults" @click="retryResults">
          <span v-if="busy.retry" class="spinner-border spinner-border-sm me-1"></span>
          <i v-else class="bi bi-arrow-repeat me-1"></i>Reintentar envíos fallidos ({{ failedResults.length }})
        </button>
        <button v-if="view.canEditRestrictions" class="btn btn-outline-secondary" @click="editor.open = !editor.open">
          <i class="bi bi-person-x me-1"></i>{{ editor.open ? 'Cerrar restricciones' : 'Editar restricciones' }}
        </button>
        <button class="btn btn-outline-secondary ms-auto" @click="load({ silent: true })"><i class="bi bi-arrow-clockwise"></i><span class="visually-hidden">Actualizar</span></button>
      </div>

      <!-- Editor de restricciones -->
      <Transition name="fade-up">
        <div v-if="editor.open && view.canEditRestrictions" class="card-soft p-4 mb-4">
          <div class="d-flex flex-wrap justify-content-between gap-2 mb-3">
            <h2 class="h5 mb-0"><i class="bi bi-person-x text-primary me-2"></i>Restricciones</h2>
            <div class="form-check form-switch">
              <input id="adm-recip" v-model="editor.reciprocal" class="form-check-input" type="checkbox" role="switch" />
              <label class="form-check-label small" for="adm-recip">Recíprocas</label>
            </div>
          </div>
          <div class="row g-3">
            <div v-for="p in view.participants" :key="p.id" class="col-md-6">
              <div class="border rounded-3 p-3 h-100">
                <div class="fw-semibold">{{ p.name }}</div>
                <ExclusionPicker
                  :options="view.participants.filter((o) => o.id !== p.id).map((o) => ({ id: o.id, label: o.name }))"
                  :selected="editor.exclusions[p.id] ?? []"
                  :owner-label="p.name"
                  @toggle="(id) => toggle(p.id, id)"
                />
              </div>
            </div>
          </div>
          <div v-if="!editorAnalysis.possible" class="alert alert-danger mt-3 mb-0">
            <i class="bi bi-exclamation-triangle-fill me-1"></i>
            Con estas restricciones el sorteo sería imposible
            <span v-if="editorAnalysis.blockedIds.length">({{ editorAnalysis.blockedIds.map((id) => nameById[id]).join(', ') }} no tendría a quién regalar)</span>.
          </div>
          <div class="d-flex justify-content-end gap-2 mt-3">
            <button class="btn btn-outline-secondary" @click="(editor.open = false), resetEditor()">Cancelar</button>
            <button class="btn btn-pine" :disabled="busy.restrictions || !editorAnalysis.possible" @click="saveRestrictions">
              <span v-if="busy.restrictions" class="spinner-border spinner-border-sm me-1"></span>Guardar restricciones
            </button>
          </div>
        </div>
      </Transition>

      <!-- Participantes -->
      <div class="card-soft overflow-hidden mb-4">
        <div class="table-responsive">
          <table class="table align-middle mb-0 participants-table">
            <thead>
              <tr>
                <th>Participante</th>
                <th>Preferencias</th>
                <th>Invitación</th>
                <th v-if="!isCollecting">Resultado</th>
                <th v-if="isCollecting" class="text-end"><span class="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in view.participants" :key="p.id">
                <td data-label="Participante">
                  <div class="fw-semibold">{{ p.name }}</div>
                  <div class="small text-secondary text-break">{{ p.email }}</div>
                  <div v-if="p.exclusions.length" class="small text-danger-emphasis">
                    <i class="bi bi-slash-circle me-1"></i>No regala a {{ p.exclusions.map((id) => nameById[id]).join(', ') }}
                  </div>
                </td>
                <td data-label="Preferencias">
                  <span v-if="p.hasPreferences" class="text-success fw-semibold"><i class="bi bi-check-circle-fill me-1"></i>Completadas</span>
                  <span v-else class="text-warning-emphasis"><i class="bi bi-clock me-1"></i>Pendiente</span>
                </td>
                <td data-label="Invitación">
                  <span class="badge" :class="INVITATION[p.invitation.status]?.cls">{{ INVITATION[p.invitation.status]?.label }}</span>
                  <div v-if="p.invitation.expiresAt && isCollecting && !p.hasPreferences" class="small mt-1" :class="p.invitation.expired ? 'text-danger' : 'text-secondary'">
                    <template v-if="p.invitation.expired"><i class="bi bi-x-circle me-1"></i>Caducó el {{ formatDateTime(p.invitation.expiresAt) }}</template>
                    <template v-else>Caduca en {{ timeLeft(p.invitation.expiresAt) }} ({{ formatDateTime(p.invitation.expiresAt) }})</template>
                  </div>
                  <div v-if="p.invitation.lastError" class="small text-danger mt-1">{{ p.invitation.lastError }}</div>
                </td>
                <td v-if="!isCollecting" data-label="Resultado">
                  <span v-if="p.resultEmail" class="badge" :class="RESULT[p.resultEmail.status]?.cls">{{ RESULT[p.resultEmail.status]?.label }}</span>
                </td>
                <td v-if="isCollecting" class="text-end">
                  <button class="btn btn-sm btn-outline-primary" :disabled="busy.row === p.id || p.invitation.status === 'sending'" @click="resend([p.id])">
                    <span v-if="busy.row === p.id" class="spinner-border spinner-border-sm"></span>
                    <template v-else><i class="bi bi-arrow-repeat me-1"></i>Nuevo enlace</template>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-7">
          <div class="card-soft p-4 h-100 small text-secondary">
            <h2 class="h6 text-dark"><i class="bi bi-shield-lock text-pine me-1"></i>Privacidad</h2>
            <ul class="mb-0 ps-3">
              <li>Ni tú ni nadie puede consultar quién regala a quién: cada persona solo recibe su resultado por correo.</li>
              <li>Las preferencias de cada participante solo las ve la persona a la que le toque regalarle.</li>
              <li>Los enlaces de invitación caducan a las {{ view.invitationTtlHours }} h. Enviar uno nuevo invalida el anterior.</li>
              <li>El grupo se eliminará automáticamente como tarde el {{ formatDateTime(group.deleteAfter) }}.</li>
            </ul>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="card-soft p-4 h-100 border-danger-subtle">
            <h2 class="h6 text-danger"><i class="bi bi-trash3 me-1"></i>Eliminar grupo</h2>
            <p class="small text-secondary">Borra definitivamente el grupo y todos los datos personales. No se puede deshacer.</p>
            <label for="confirm-name" class="form-label small">Escribe <strong>{{ group.name }}</strong> para confirmar</label>
            <div class="d-flex gap-2">
              <input id="confirm-name" v-model="confirmName" class="form-control form-control-sm" autocomplete="off" />
              <button class="btn btn-sm btn-danger text-nowrap" :disabled="confirmName.trim() !== group.name || busy.delete" @click="deleteGroup">Eliminar</button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.stats > div + div {
  border-left: 1px solid #f1e6d8;
}
.stat {
  font-family: 'Fraunces Variable', serif;
  font-size: 2rem;
  font-weight: 700;
  line-height: 1.2;
}
.participants-table th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #fffaf3;
}
.participants-table td,
.participants-table th {
  padding: 0.9rem 1rem;
}

// En móvil la tabla se convierte en tarjetas.
@media (max-width: 767.98px) {
  .stats > div:nth-child(3) { border-left: none; }
  .stats > div:nth-child(n + 3) { border-top: 1px solid #f1e6d8; }
  .participants-table thead { display: none; }
  .participants-table tr {
    display: block;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f1e6d8;
  }
  .participants-table td {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    border: none;
    padding: 0.35rem 1rem;
    text-align: right;
  }
  .participants-table td[data-label]::before {
    content: attr(data-label);
    font-weight: 600;
    color: #64748b;
    font-size: 0.8rem;
    text-align: left;
  }
  .participants-table td:first-child {
    display: block;
    text-align: left;
  }
  .participants-table td:first-child::before { display: none; }
}
</style>
