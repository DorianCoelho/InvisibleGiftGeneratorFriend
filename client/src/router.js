import { createRouter, createWebHistory } from 'vue-router';
import { wizard, isStepValid } from './stores/wizard.js';

const routes = [
  { path: '/', name: 'home', component: () => import('./views/HomeView.vue'), meta: { title: 'Amigo Invisible' } },
  {
    path: '/crear',
    component: () => import('./views/CreateGroupView.vue'),
    children: [
      { path: '', redirect: { name: 'create-group' } },
      { path: 'grupo', name: 'create-group', component: () => import('./components/wizard/StepGroup.vue'), meta: { step: 1, title: 'Crear grupo' } },
      {
        path: 'participantes',
        name: 'create-participants',
        component: () => import('./components/wizard/StepParticipants.vue'),
        meta: { step: 2, title: 'Participantes', requires: 1 },
      },
      {
        path: 'confirmar',
        name: 'create-confirm',
        component: () => import('./components/wizard/StepConfirm.vue'),
        meta: { step: 3, title: 'Confirmar grupo', requires: 2 },
      },
    ],
  },
  { path: '/crear/listo', name: 'group-created', component: () => import('./views/GroupCreatedView.vue'), meta: { title: '¡Grupo creado!' } },
  {
    path: '/preferencias/:groupId/guardado',
    name: 'preferences-saved',
    component: () => import('./views/PreferencesSavedView.vue'),
    meta: { title: 'Preferencias guardadas' },
  },
  {
    path: '/preferencias/:groupId/:token([A-Za-z0-9_-]{20,128})?',
    name: 'preferences',
    component: () => import('./views/PreferencesView.vue'),
    meta: { title: 'Mis preferencias' },
  },
  { path: '/sorteo/:groupId?', name: 'draw-done', component: () => import('./views/DrawDoneView.vue'), meta: { title: 'Sorteo realizado' } },
  { path: '/organizador/:groupId', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { title: 'Panel del organizador' } },
  { path: '/enlace-invalido', name: 'invalid-link', component: () => import('./views/InvalidLinkView.vue'), meta: { title: 'Enlace no válido' } },
  { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./views/InvalidLinkView.vue'), meta: { title: 'Página no encontrada' } },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // El fragmento (#) de la URL contiene el token de acceso, no un ancla: nunca hacemos scroll a él.
  scrollBehavior: () => ({ top: 0 }),
});

router.beforeEach((to) => {
  const required = to.meta.requires;
  if (required) {
    for (let step = 1; step <= required; step++) {
      if (!isStepValid(step)) return { name: step === 1 ? 'create-group' : 'create-participants' };
    }
  }
  if (to.name === 'group-created' && !wizard.created) return { name: 'home' };
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title && to.meta.title !== 'Amigo Invisible' ? `${to.meta.title} · Amigo Invisible` : 'Amigo Invisible';
});

export default router;
