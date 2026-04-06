const CACHE_NAME = 'party-game-v2';
const ASSETS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/socket.js',
  '/js/screens/lobby.js',
  '/js/screens/questionSetup.js',
  '/js/screens/questions.js',
  '/js/screens/guessing.js',
  '/js/screens/results.js',
  '/js/screens/leaderboard.js',
  '/js/screens/podium.js',
  '/js/ui/utils.js',
  '/js/ui/animations.js',
  '/js/ui/sounds.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('/socket.io/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
