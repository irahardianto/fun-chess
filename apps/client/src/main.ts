import { createApp } from 'vue';
import App from './App.vue';
import './assets/design-tokens.css';

const app = createApp(App);

// Global Error Handler
app.config.errorHandler = (err, _instance, info) => {
  console.error('[FunChess] Unhandled Vue error:', {
    error: err instanceof Error ? err.message : String(err),
    componentInfo: info,
    stack: err instanceof Error ? err.stack : undefined,
  });
};

app.mount('#app');
