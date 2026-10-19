// Brings saves over from the machines' old addresses the first time Free Play opens: Tilt's high scores from
// tilt.junkdrawer.works, and Roll Up's tickets, prizes, best score and today's card from roll-up.junkdrawer.works.
// A browser keeps each address's saves apart, so without this the move into the arcade would start everyone over.
//
// It runs before anything else on every page. While an old address still has something to hand over, it stops the
// page from loading (so a machine can't start and save over what's coming), asks that address's carry.html in a hidden
// frame, puts what comes back where Free Play keeps it, and loads the page again. After that it does nothing, and it
// never does anything away from https://free-play.junkdrawer.works (a local copy, an Artifact, most of the tests).
(() => {
  const HOME = 'https://free-play.junkdrawer.works';
  const FROM = { tilt: 'https://tilt.junkdrawer.works', 'roll-up': 'https://roll-up.junkdrawer.works' };
  const STATE = 'free-play.carried'; // { tilt: 'done' | visits tried, 'roll-up': … }
  let local, session, state;
  try {
    if (location.origin !== HOME) return;
    local = localStorage; session = sessionStorage;
    if (session.getItem(STATE)) return; // tried already this visit
    state = JSON.parse(local.getItem(STATE) || '{}') || {};
  } catch { return; } // storage is blocked, so there's nowhere to put saves anyway
  const todo = Object.keys(FROM).filter(name => state[name] !== 'done' && !(state[name] >= 3));
  if (!todo.length) return;

  // Where each machine's old saves go now.
  const put = (key, value) => { if (local.getItem(key) === null) local.setItem(key, value); };
  const ARRIVE = {
    tilt(items) {
      // Tilt's store (top fives per table, the last table, the sound) comes over as it was.
      if (items['tilt.v1'] != null) put('free-play.tilt', items['tilt.v1']);
    },
    'roll-up'(items) {
      if (items['roll-up.v1'] == null) return;
      const old = JSON.parse(items['roll-up.v1']) || {};
      const { tickets = 0, prizes = {}, ...own } = old;
      put('free-play.roll-up', JSON.stringify(own)); // best, games, sound, today's card
      // its tickets and prizes go into the arcade's wallet, on top of anything already there
      const w = JSON.parse(local.getItem('free-play.wallet') || '{}') || {};
      w.tickets = (Number(w.tickets) || 0) + Math.max(0, Math.floor(Number(tickets) || 0));
      w.prizes = w.prizes || {};
      for (const [id, n] of Object.entries(prizes)) if (n > 0) w.prizes[id] = (w.prizes[id] || 0) + Math.floor(n);
      local.setItem('free-play.wallet', JSON.stringify(w));
    },
  };

  window.stop();
  const frames = {};
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    for (const name of todo) if (state[name] !== 'done') state[name] = (Number(state[name]) || 0) + 1; // no answer: try again next visit
    try { local.setItem(STATE, JSON.stringify(state)); session.setItem(STATE, '1'); } catch { /* the reload plays on regardless */ }
    location.reload();
  };
  const settled = () => todo.every(name => state[name] === 'done' || frames[name].gaveUp);
  const overall = setTimeout(finish, 8000);

  addEventListener('message', e => {
    const name = todo.find(n => FROM[n] === e.origin && frames[n].contentWindow === e.source);
    if (!name || state[name] === 'done' || !e.data || !e.data.carried) return;
    try { ARRIVE[name](e.data.carried.local || {}); state[name] = 'done'; } catch { frames[name].gaveUp = true; }
    if (settled()) { clearTimeout(overall); finish(); }
  });
  for (const name of todo) {
    const f = document.createElement('iframe');
    f.hidden = true;
    f.onload = () => {
      f.contentWindow.postMessage({ carry: true }, FROM[name]);
      // loaded but never answered (an old address without carry.html yet): leave it for another visit
      setTimeout(() => { f.gaveUp = true; if (settled()) { clearTimeout(overall); finish(); } }, 3000);
    };
    f.src = FROM[name] + '/carry.html';
    frames[name] = f;
    document.documentElement.appendChild(f);
  }
})();
