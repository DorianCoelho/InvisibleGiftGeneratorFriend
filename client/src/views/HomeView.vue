<script setup>
import { RouterLink } from 'vue-router';

const scrollToHow = () => document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' });

const steps = [
  { icon: 'bi-people-fill', color: 'var(--gift-red)', title: 'Crea el grupo', text: 'Nombre, presupuesto, participantes y quién no puede regalar a quién.' },
  { icon: 'bi-envelope-heart-fill', color: 'var(--pine)', title: 'Cada uno elige', text: 'Todos reciben un enlace personal para indicar tres regalos que les gustaría recibir.' },
  { icon: 'bi-shuffle', color: 'var(--gold)', title: 'Sorteo automático', text: 'Cuando todos responden, sorteamos y cada persona recibe su resultado por correo.' },
];

const features = [
  { icon: 'bi-person-x', title: 'Restricciones', text: 'Evita que parejas o familiares se regalen entre sí.' },
  { icon: 'bi-incognito', title: 'Secreto de verdad', text: 'Ni el organizador puede ver quién regala a quién.' },
  { icon: 'bi-person-check', title: 'Sin registro', text: 'Sin cuentas ni contraseñas: solo enlaces seguros.' },
  { icon: 'bi-trash3', title: 'Datos efímeros', text: 'Los datos del grupo se borran al completar el sorteo.' },
];
</script>

<template>
  <div>
    <section class="hero">
      <div class="container page-wide py-5">
        <div class="row align-items-center g-5">
          <div class="col-lg-7 text-center text-lg-start">
            <span class="badge rounded-pill text-bg-light border mb-3 px-3 py-2">
              <i class="bi bi-stars text-gold me-1"></i> Navidad, cumpleaños o cualquier excusa para regalar
            </span>
            <h1 class="display-4 fw-bold mb-3">Organiza tu <span class="text-primary">Amigo Invisible</span> en dos minutos</h1>
            <p class="lead text-secondary mb-4">
              Invita a tu grupo, recoge las listas de deseos y deja que el sorteo se haga solo. Sin hojas de cálculo, sin papelitos y sin
              que nadie haga trampas.
            </p>
            <div class="d-flex flex-column flex-sm-row gap-3 justify-content-center justify-content-lg-start">
              <RouterLink :to="{ name: 'create-group' }" class="btn btn-primary btn-lg px-4">
                <i class="bi bi-gift me-2"></i>Crear mi grupo
              </RouterLink>
              <a href="#como-funciona" class="btn btn-outline-secondary btn-lg px-4" @click.prevent="scrollToHow">
                Cómo funciona
              </a>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="gift-stage" aria-hidden="true">
              <div class="gift gift-1"><i class="bi bi-gift-fill"></i></div>
              <div class="gift gift-2"><i class="bi bi-gift"></i></div>
              <div class="gift gift-3"><i class="bi bi-balloon-heart-fill"></i></div>
              <div class="card-soft mock-card p-3">
                <div class="small text-secondary">Te ha tocado regalar a</div>
                <div class="fs-3 fw-bold text-primary display-font">María</div>
                <div class="budget-pill mt-2 small"><i class="bi bi-wallet2"></i> De 15 € a 30 €</div>
                <ul class="list-unstyled small mt-3 mb-0 text-secondary">
                  <li><i class="bi bi-check2-circle text-success me-1"></i>Un libro de cocina italiana</li>
                  <li><i class="bi bi-check2-circle text-success me-1"></i>Una taza personalizada</li>
                  <li><i class="bi bi-check2-circle text-success me-1"></i>Una tarjeta regalo</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="como-funciona" class="container page-wide py-5">
      <h2 class="text-center mb-5">Así de fácil</h2>
      <div class="row g-4">
        <div v-for="(step, i) in steps" :key="step.title" class="col-md-4">
          <div class="card-soft h-100 p-4 position-relative">
            <span class="step-number">{{ i + 1 }}</span>
            <span class="icon-bubble mb-3 text-white" :style="{ background: step.color }"><i class="bi" :class="step.icon"></i></span>
            <h3 class="h5">{{ step.title }}</h3>
            <p class="text-secondary mb-0">{{ step.text }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="container page-wide pb-5">
      <div class="row g-3">
        <div v-for="f in features" :key="f.title" class="col-sm-6 col-lg-3">
          <div class="d-flex gap-3 p-3">
            <i class="bi fs-3 text-pine" :class="f.icon"></i>
            <div>
              <div class="fw-semibold">{{ f.title }}</div>
              <div class="small text-secondary">{{ f.text }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="ribbon-header rounded-4 p-4 p-md-5 mt-4 text-center">
        <h2 class="h3 mb-3 position-relative">¿Listos para regalar?</h2>
        <RouterLink :to="{ name: 'create-group' }" class="btn btn-light btn-lg px-4 position-relative text-primary">
          Empezar ahora <i class="bi bi-arrow-right ms-1"></i>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.hero {
  overflow: hidden;
}
.gift-stage {
  position: relative;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.mock-card {
  width: min(280px, 90%);
  transform: rotate(2deg);
  position: relative;
  z-index: 2;
}
.gift {
  position: absolute;
  font-size: 4rem;
  animation: float 6s ease-in-out infinite;
  z-index: 1;
}
.gift-1 { top: 0; left: 8%; color: var(--gift-red); }
.gift-2 { bottom: 4%; right: 6%; color: var(--pine); animation-delay: -2s; }
.gift-3 { top: 8%; right: 10%; color: var(--gold); font-size: 3rem; animation-delay: -4s; }
@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-12px) rotate(4deg); }
}
.step-number {
  position: absolute;
  top: 1rem;
  right: 1.25rem;
  font-family: 'Fraunces Variable', serif;
  font-size: 2.5rem;
  font-weight: 800;
  color: #f4e9da;
}
</style>
