(() => {
  if (window.__AUTO_SCROLL_PROVENANCE_PATCHED__) return;
  window.__AUTO_SCROLL_PROVENANCE_PATCHED__ = true;

  const GESTURE_WINDOW_MS = 800;
  let lastGestureAt = 0;
  let programmaticUntil = 0;

  const markGesture = () => {
    lastGestureAt = performance.now();
  };

  ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach((type) => {
    window.addEventListener(type, markGesture, {
      capture: true,
      passive: true,
    });
  });

  const proto = Element.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'scrollTop');

  if (desc && desc.set) {
    Object.defineProperty(proto, 'scrollTop', {
      ...desc,
      set(value) {
        programmaticUntil = performance.now() + 150;
        return desc.set.call(this, value);
      },
    });
  }

  const origScrollTo = proto.scrollTo;
  if (origScrollTo) {
    proto.scrollTo = function (...args) {
      programmaticUntil = performance.now() + 150;
      return origScrollTo.apply(this, args);
    };
  }

  window.addEventListener(
    'scroll',
    (event) => {
      const now = performance.now();
      event.__wrapperProvenance = {
        programmatic: now < programmaticUntil,
        userGesture: now - lastGestureAt < GESTURE_WINDOW_MS,
      };
    },
    { capture: true, passive: true }
  );

  window.__wrapperScrollProvenance = () => ({
    programmaticUntil,
    lastGestureAt,
    now: performance.now(),
  });

  console.log('[provenance] patch active');
})();
