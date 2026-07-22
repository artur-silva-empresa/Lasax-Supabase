
// ⚠️ Incrementar a versão a cada deploy para forçar refresh do cache em todos os clientes
const CACHE_VERSION = 'v13';
const CACHE_NAME = `prod-lasa-${CACHE_VERSION}`;

// Assets que são pré-cacheados na instalação (shell da aplicação)
// O Vite gera hashes nos nomes dos ficheiros, por isso cacheamos tudo via fetch intercept
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sql-wasm.wasm',
  './icons/icone.png'
];

// -------------------------
// INSTALL — pré-cachear shell
// -------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch((err) => {
        console.warn('[SW] Falha no pré-cache (normal na 1ª instalação sem rede):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// -------------------------
// ACTIVATE — limpar caches antigos
// -------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] A remover cache antigo:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// -------------------------
// FETCH — estratégia híbrida
// -------------------------
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Ignorar pedidos a outros domínios (não há nenhum em modo offline)
  // Se houver chamadas externas inesperadas, deixar passar sem cache
  if (url.origin !== self.location.origin) return;

  // Para o ficheiro WASM — sempre Cache First (nunca muda)
  if (url.pathname.endsWith('.wasm')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // Para assets com hash no nome (JS, CSS, fontes geradas pelo Vite) — Cache First
  // Os ficheiros com hash nunca mudam de conteúdo, só o nome muda entre builds
  const hasHash = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf)(\?.*)?$/.test(url.pathname);
  if (hasHash) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => caches.match('./index.html'));
      })
    );
    return;
  }

  // Para index.html e navegação — Stale-While-Revalidate
  // Responde imediatamente com cache, atualiza em background para o próximo carregamento
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.status === 200) {
            cache.put(event.request, response.clone());
          }
          return response;
        }).catch(() => cached); // Se sem rede, usa o que está em cache

        return cached || fetchPromise;
      });
    })
  );
});

// -------------------------
// PUSH NOTIFICATIONS — Receber e exibir alertas de encomendas
// -------------------------
self.addEventListener('push', (event) => {
  console.log('[SW] Push Notification recebida:', event);

  let payload = {
    title: 'TexFlow — Notificação de Encomenda',
    body: 'Ocorreu uma atualização relevante na sua encomenda.',
    icon: './icons/icone.png',
    badge: './icons/icone.png',
    tag: 'order-push-notification',
    data: { url: '/' }
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch (err) {
      payload.body = event.data.text();
    }
  }

  const options = {
    body: payload.body,
    icon: payload.icon || './icons/icone.png',
    badge: payload.badge || './icons/icone.png',
    vibrate: [150, 50, 150],
    tag: payload.tag || 'texflow-notification',
    renotify: true,
    data: payload.data || { url: '/' },
    actions: [
      { action: 'open', title: 'Ver Detalhes' },
      { action: 'dismiss', title: 'Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  );
});

// -------------------------
// NOTIFICATION CLICK — Ação do utilizador ao clicar na notificação
// -------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Procura por uma janela da aplicação já aberta
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({
            type: 'PUSH_NOTIFICATION_CLICK',
            data: event.notification.data
          });
          return client.focus();
        }
      }
      // Se não houver nenhuma janela aberta, abre uma nova
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// -------------------------
// MESSAGE — Comunicação com a App Frontend
// -------------------------
self.addEventListener('message', (event) => {
  if (!event.data) return;

  if (event.data === 'SKIP_WAITING' || event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (event.data.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, data } = event.data;
    self.registration.showNotification(title || 'TexFlow — Alerta de Encomenda', {
      body: body || 'Nova atualização registada.',
      icon: './icons/icone.png',
      badge: './icons/icone.png',
      vibrate: [150, 50, 150],
      tag: tag || 'manual-order-notification',
      renotify: true,
      data: data || { url: '/' }
    });
  }
});

