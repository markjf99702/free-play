// A machine's title card, for someone who's played the machine before. On a first visit the card has it all: the
// sign, what the machine is, how to play it, and Play. Once the machine has been played (its save says so: the count
// this tag's data-played names, in the save data-save names, is over 0), the page is marked fp-back, and the card is
// just the sign, Play, the prize counter and the best, at the foot of the screen, so the machine playing by itself
// behind it shows. What the machine is and how to play it fold under How to play, which opens and shuts them (see the
// end of shared/arcade.css). Loaded in each machine's <head>, not as a module, so the card comes up small from the
// start: from a module it would show whole for a moment first, and then shrink.
(() => {
  const tag = document.currentScript;
  let played = false;
  try { played = Number(JSON.parse(localStorage.getItem(tag.dataset.save))?.[tag.dataset.played]) > 0; } catch { /* none yet, or storage is off */ }
  if (played) document.documentElement.classList.add('fp-back');
  document.addEventListener('click', e => {
    const fold = e.target.closest?.('.fp-fold');
    if (fold) fold.setAttribute('aria-expanded', String(fold.getAttribute('aria-expanded') !== 'true'));
  });
})();
