import { createApp } from 'vue';
import { createWebHistory } from 'vue-router';
import App from './App.vue';
import { createAppRouter, resolveDocumentMeta } from './router';
import './styles/global.css';

const router = createAppRouter(createWebHistory(import.meta.env.BASE_URL));

// 客户端导航时同步 title / meta description，保证 6 条路由各有独立头部信息（I7）
router.afterEach((to) => {
  const meta = resolveDocumentMeta(to.path);
  if (!meta) return;
  document.title = meta.title;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute('content', meta.description);
});

const app = createApp(App).use(router);

// 等首次导航就绪再挂载：挂载前预渲染的静态 HTML 一直可见，避免首帧白屏
void router.isReady().then(
  () => app.mount('#app'),
  () => app.mount('#app'),
);
