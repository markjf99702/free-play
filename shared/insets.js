// The safe area: how far in from each edge of the screen a phone's notch, rounded corners and home indicator reach, in
// CSS pixels. Every page asks for the whole screen (viewport-fit=cover), so on an iPhone the page runs under them;
// each machine keeps its cabinet and control deck clear of them. They're 0 on most screens, and in the tests.
let probe;
export function insets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) '
      + 'env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.append(probe);
  }
  const cs = getComputedStyle(probe), px = v => parseFloat(v) || 0;
  return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
}
