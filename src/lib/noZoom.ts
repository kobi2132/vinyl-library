// Locks zoom on phones. The viewport meta tag (user-scalable=no) covers Android,
// but iOS Safari ignores it, so pinch is blocked here as well. Double-tap zoom is
// turned off by `touch-action` in index.css.
// maximum-scale=1 in the same tag stops iOS from zooming into a focused input.

if (typeof document !== 'undefined') {
  const stop = (e: Event) => e.preventDefault()

  // iOS pinch gestures
  document.addEventListener('gesturestart', stop, { passive: false })
  document.addEventListener('gesturechange', stop, { passive: false })
  document.addEventListener('gestureend', stop, { passive: false })

  // Two-finger pinch on browsers without gesture events
  document.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches.length > 1) e.preventDefault()
    },
    { passive: false },
  )
}
