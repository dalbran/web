const CACHE_NAME = 'dalbran-cache-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/firebase.js',
  './js/auth.js',
  './js/utils.js',
  './js/produtos.js',
  './js/clientes.js',
  './js/configuracoes.js',
  './js/orcamento.js',
  './js/whatsapp.js',
  './js/backup.js',
  './catalogos/catalog-data.js',
  './js/catalogos.js',
  './js/app.js',
  './manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Cache aberto com sucesso');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptação de requisições
self.addEventListener('fetch', (event) => {
  // 1. Só faz cache de requisições GET (ignora POST, PUT, DELETE do Firebase)
  if (event.request.method !== 'GET') return;

  // 2. Ignora requisições para APIs do Firebase ou extensões
  const url = event.request.url;
  if (url.includes('firestore.googleapis.com') || url.includes('identitytoolkit') || url.includes('chrome-extension')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((response) => {
        // Valida se a resposta é válida
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      }).catch(() => {
        // Retorna fallback offline se necessário
      });
    })
  );
});
