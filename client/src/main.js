import { createApp } from 'vue';
import '@fontsource-variable/inter';
import '@fontsource-variable/fraunces';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './styles/main.scss';
import App from './App.vue';
import router from './router.js';

createApp(App).use(router).mount('#app');
