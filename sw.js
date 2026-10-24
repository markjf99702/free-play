// Offline support for the whole arcade: the floor and every machine, so it all plays with no signal.
// Anything the person saves lives in localStorage, not here.
// Network first, so a new version shows up as soon as you're online.

const CACHE = 'free-play-v7'; // bump the number when the file list changes
const SHELL = [
  './', 'index.html', 'icon.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png',
  // the machines by their addresses as well as by index.html, so either opens offline
  'roll-up/', 'tilt/', 'clutch/', 'topple/', 'highrise/', 'popgun/', 'bonkers/', 'hoops/',
  // floor
  'css/floor.css', 'js/floor.js', 'floor/bonkers.jpg', 'floor/clutch.jpg', 'floor/highrise.jpg', 'floor/hoops.jpg',
  'floor/popgun.jpg', 'floor/roll-up.jpg', 'floor/tilt.jpg', 'floor/topple.jpg',
  // shared
  'shared/arcade.css', 'shared/carry.js', 'shared/counter.js', 'shared/matter.min.js', 'shared/prizes.js',
  'shared/wallet.js',
  'fonts/bungee-outline.woff2', 'fonts/bungee.woff2', 'fonts/figtree.woff2',
  // Roll Up
  'roll-up/css/app.css', 'roll-up/index.html', 'roll-up/js/app.js', 'roll-up/js/daily.js', 'roll-up/js/physics.js',
  'roll-up/js/scene.js', 'roll-up/js/sound.js',
  // Tilt
  'tilt/css/tilt.css', 'tilt/index.html', 'tilt/js/game.js', 'tilt/js/main.js', 'tilt/js/physics.js',
  'tilt/js/render.js', 'tilt/js/settings.js', 'tilt/js/sound.js', 'tilt/js/tables.js',
  'tilt/js/tables/classic/draw.js', 'tilt/js/tables/classic/index.js', 'tilt/js/tables/classic/layout.js',
  'tilt/js/tables/classic/rules.js', 'tilt/js/tables/classic/skins.js', 'tilt/js/tables/haunted/draw.js',
  'tilt/js/tables/haunted/index.js', 'tilt/js/tables/haunted/layout.js', 'tilt/js/tables/haunted/rules.js',
  'tilt/js/tables/haunted/skins.js', 'tilt/js/tables/space/draw.js', 'tilt/js/tables/space/index.js',
  'tilt/js/tables/space/layout.js', 'tilt/js/tables/space/rules.js', 'tilt/js/tables/space/skins.js',
  // Clutch
  'clutch/css/clutch.css', 'clutch/index.html', 'clutch/js/app.js', 'clutch/js/draw.js', 'clutch/js/machine.js',
  'clutch/js/sound.js',
  // Topple
  'topple/css/topple.css', 'topple/index.html', 'topple/js/app.js', 'topple/js/draw.js', 'topple/js/machine.js',
  'topple/js/sound.js',
  // Highrise
  'highrise/css/highrise.css', 'highrise/index.html', 'highrise/js/app.js', 'highrise/js/draw.js', 'highrise/js/sound.js',
  'highrise/js/tower.js',
  // Popgun
  'popgun/css/popgun.css', 'popgun/index.html', 'popgun/js/app.js', 'popgun/js/draw.js', 'popgun/js/gallery.js',
  'popgun/js/sound.js',
  // Bonkers
  'bonkers/css/bonkers.css', 'bonkers/index.html', 'bonkers/js/app.js', 'bonkers/js/burrow.js', 'bonkers/js/draw.js',
  'bonkers/js/sound.js',
  // Hoops
  'hoops/css/hoops.css', 'hoops/index.html', 'hoops/js/app.js', 'hoops/js/court.js', 'hoops/js/draw.js',
  'hoops/js/sound.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fresh(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});

// GitHub Pages lets browsers keep files for ten minutes, so without this an update can take that long to show up.
// Ask the server every time instead; a file that hasn't changed comes back as a quick "not modified".
function fresh(request) {
  const got = request.mode === 'navigate'
    // A page load can't be answered with a redirected response, so fall back to the plain request if there was one.
    ? fetch(request.url, { cache: 'no-cache' }).then(res => (res.redirected ? fetch(request) : res))
    : fetch(request, { cache: 'no-cache' });
  return got.then(askAgainNextTime);
}

// The open tab keeps its own copy of each file too, and would reuse it on a reload without asking.
// Marking the copy it gets from here no-cache sends that reload back through fresh() as well.
function askAgainNextTime(res) {
  if (res.status !== 200 || res.type !== 'basic' || res.redirected) return res;
  const headers = new Headers(res.headers);
  headers.set('cache-control', 'no-cache');
  headers.delete('content-encoding'); // the body here is already unpacked
  headers.delete('content-length');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}
