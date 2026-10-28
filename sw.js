// Offline support for the whole arcade: the floor and every machine, so it all plays with no signal.
// Anything the person saves lives in localStorage, not here.
// Network first, so a new version shows up as soon as you're online, but a page the network hasn't answered in a few
// seconds opens from the offline copy instead.

// An installed copy downloads the whole list again only when this file changes by a byte. Otherwise each file in it is
// refreshed only when a page that loads it is visited online, and the copy could mix two releases. So FILES is a
// fingerprint of every file in SHELL: change any of them and test/arcade.test.mjs fails until FILES is changed to
// match (it says what to), which changes this file, so every copy is made whole again at once. Bump CACHE's number
// as well when the list itself changes.
const CACHE = 'free-play-v9';
const FILES = '23f6533a'; // test/arcade.test.mjs checks this
const SHELL = [
  './', 'index.html', 'icon.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png',
  // the page for an address that is not there
  '404.html',
  // the machines by their addresses as well as by index.html, so either opens offline
  'roll-up/', 'tilt/', 'clutch/', 'topple/', 'highrise/', 'popgun/', 'bonkers/', 'hoops/',
  // floor
  'css/floor.css', 'js/floor.js', 'floor/bonkers.jpg', 'floor/clutch.jpg', 'floor/highrise.jpg', 'floor/hoops.jpg',
  'floor/popgun.jpg', 'floor/roll-up.jpg', 'floor/tilt.jpg', 'floor/topple.jpg',
  // shared
  'shared/arcade.css', 'shared/carry.js', 'shared/counter.js', 'shared/insets.js', 'shared/matter.min.js',
  'shared/prizes.js', 'shared/wallet.js',
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

// Each file straight from the server (a quick "not modified" for one that hasn't changed), not from the browser's own
// copies, which can be ten minutes old (see fresh() below): an offline copy made from those could mix in old files.
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'no-cache' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// How long a page waits for the network before it opens from the offline copy instead.
const PATIENCE = 4000; // ms
// The pages (by their client ids) that opened from the offline copy: the rest of their files come from it too, so a
// page never mixes old files with new ones. (The browser stops the worker once it has been idle a while, and the
// list goes with it.)
const fromCopy = new Set();

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (e.request.mode === 'navigate') e.respondWith(page(e));
  else if (fromCopy.has(e.clientId)) e.respondWith(kept(e.request).then(r => r || network(e)));
  else e.respondWith(network(e).catch(() => offline(e.request)));
});

// A page, from the network. On a connection that's up but not answering (a train, a captive wifi, one bar of signal),
// it opens from the offline copy after PATIENCE instead, if the copy has it, and the network's answer still goes into
// the copy when it comes. With no copy of the page, it waits on for the network. With no network at all, it opens
// from the copy straight away, as it always has.
function page(e) {
  const net = network(e);
  return new Promise((resolve, reject) => {
    let done = false;
    const answer = res => { if (!done) { done = true; resolve(res); } };
    const slow = setTimeout(() => kept(e.request).then(copy => {
      if (!copy || done) return;
      if (e.resultingClientId) {
        fromCopy.add(e.resultingClientId);
        if (fromCopy.size > 50) fromCopy.delete(fromCopy.values().next().value); // the oldest, long gone
      }
      answer(copy);
    }), PATIENCE);
    net.then(res => { clearTimeout(slow); answer(res); },
      () => { clearTimeout(slow); offline(e.request).then(answer, reject); });
  });
}

// A file from the network, kept in the offline copy for next time. The worker stays up until it's in, even when the
// page has had its answer from the copy by then.
function network(e) {
  let stored;
  const got = fresh(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); stored = caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  });
  try { e.waitUntil(got.then(() => stored, () => {})); } catch { /* the event is over: the copy goes in anyway */ }
  return got;
}

const kept = request => caches.match(request, { ignoreSearch: true });
// With no network: the file from the offline copy. A page it hasn't got (a mistyped address) gets the arcade's own
// page saying so, 404.html, as GitHub Pages answers online. A script, a style or a picture it hasn't got fails, as it
// would with no copy at all: the floor's page in its place only broke whatever asked for it.
async function offline(request) {
  const copy = await kept(request);
  if (copy) return copy;
  const lost = request.mode === 'navigate' && await caches.match('404.html');
  return lost || Response.error();
}

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
