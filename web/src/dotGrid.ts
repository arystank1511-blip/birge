/**
 * "Dot grid warp": a static grid of dots behind the UI. Dots near the pointer are pushed away along the
 * pointer→dot vector and swell as they flee, so the grid dimples like fabric under a finger.
 *
 * Plain canvas, no libraries. One rAF loop that only runs while dots are still settling, so an idle
 * pointer costs nothing. The layer is decorative: the caller marks it aria-hidden and pointer-events: none.
 */
export interface DotGridOptions {
  /** Distance between dots, CSS px. */
  gap?: number;
  /** Radius of the pointer's influence, CSS px. */
  reach?: number;
  /** Maximum displacement of a dot right next to the pointer, CSS px. */
  push?: number;
  /** Dot radius at rest, CSS px. */
  dot?: number;
}

const TAU = Math.PI * 2;
// Each frame a dot moves this fraction of the way to its target, which gives the soft "fabric" settle.
const EASE = 0.2;

export function mountDotGrid(canvas: HTMLCanvasElement, options: DotGridOptions = {}): () => void {
  const { gap = 26, reach = 150, push = 26, dot = 1 } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const root = document.documentElement;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animated = () => finePointer.matches && !reducedMotion.matches;

  let width = 0;
  let height = 0;
  let left = 0;
  let top = 0;
  let cols = 0;
  let rows = 0;
  let originX = 0;
  let originY = 0;
  // Current displacement of every dot as [dx, dy] pairs.
  let offsets = new Float32Array(0);
  let ink = '#1b1c22';
  let accent = '#3b5bfd';
  let pointerX = 0;
  let pointerY = 0;
  let pointerIn = false;
  // Over links, buttons and inputs the warp softens so it doesn't compete with the control.
  let overControl = false;
  let raf = 0;

  const readColors = () => {
    const styles = getComputedStyle(root);
    ink = styles.getPropertyValue('--text').trim() || ink;
    accent = styles.getPropertyValue('--accent').trim() || accent;
  };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    left = rect.left;
    top = rect.top;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    // One extra row and column so the grid always bleeds past the edges, centred in the container.
    cols = Math.ceil(width / gap) + 1;
    rows = Math.ceil(height / gap) + 1;
    originX = (width - (cols - 1) * gap) / 2;
    originY = (height - (rows - 1) * gap) / 2;
    offsets = new Float32Array(cols * rows * 2);
    draw();
  }

  /** Moves every dot toward its target. Returns true while anything is still visibly moving. */
  function step() {
    const strength = overControl ? push * 0.4 : push;
    let moving = false;
    for (let row = 0; row < rows; row++) {
      const y = originY + row * gap;
      for (let col = 0; col < cols; col++) {
        const x = originX + col * gap;
        const k = (row * cols + col) * 2;
        let targetX = 0;
        let targetY = 0;
        if (pointerIn) {
          const dx = x - pointerX;
          const dy = y - pointerY;
          const distance = Math.hypot(dx, dy);
          if (distance < reach && distance > 0.001) {
            const t = 1 - distance / reach;
            const falloff = t * t * (3 - 2 * t); // smoothstep: no hard edge at the rim
            targetX = (dx / distance) * strength * falloff;
            targetY = (dy / distance) * strength * falloff;
          }
        }
        const nextX = offsets[k] + (targetX - offsets[k]) * EASE;
        const nextY = offsets[k + 1] + (targetY - offsets[k + 1]) * EASE;
        if (Math.abs(nextX - offsets[k]) > 0.01 || Math.abs(nextY - offsets[k + 1]) > 0.01) moving = true;
        offsets[k] = nextX;
        offsets[k + 1] = nextY;
      }
    }
    return moving;
  }

  function draw() {
    ctx!.clearRect(0, 0, width, height);

    // Resting dots in one path and one fill; displaced dots are collected and drawn on top.
    const hot: number[] = [];
    ctx!.fillStyle = ink;
    ctx!.globalAlpha = 0.16;
    ctx!.beginPath();
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const k = (row * cols + col) * 2;
        const x = originX + col * gap + offsets[k];
        const y = originY + row * gap + offsets[k + 1];
        const swell = Math.min(1, Math.hypot(offsets[k], offsets[k + 1]) / push);
        if (swell < 0.04) {
          ctx!.moveTo(x + dot, y);
          ctx!.arc(x, y, dot, 0, TAU);
        } else {
          hot.push(x, y, swell);
        }
      }
    }
    ctx!.fill();

    ctx!.fillStyle = accent;
    for (let n = 0; n < hot.length; n += 3) {
      const swell = hot[n + 2];
      ctx!.globalAlpha = 0.25 + 0.55 * swell;
      ctx!.beginPath();
      ctx!.arc(hot[n], hot[n + 1], dot * (1 + 1.8 * swell), 0, TAU);
      ctx!.fill();
    }
    ctx!.globalAlpha = 1;
  }

  function frame() {
    raf = 0;
    const moving = step();
    draw();
    if (moving) raf = requestAnimationFrame(frame);
  }

  const kick = () => {
    if (!raf && animated() && !document.hidden) raf = requestAnimationFrame(frame);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const onPointerMove = (e: PointerEvent) => {
    // Touch and pen-free coarse input never drive the effect.
    if (e.pointerType === 'touch') return;
    pointerX = e.clientX - left;
    pointerY = e.clientY - top;
    pointerIn = true;
    overControl = e.target instanceof Element && e.target.closest('a, button, input') !== null;
    kick();
  };

  const onPointerGone = () => {
    pointerIn = false;
    kick();
  };

  const onVisibility = () => {
    if (document.hidden) stop();
    else kick();
  };

  // Switching to reduced motion or a touch screen settles everything back to a still grid.
  const onModeChange = () => {
    if (!animated()) {
      stop();
      pointerIn = false;
      offsets.fill(0);
      draw();
    }
  };

  const onThemeChange = () => {
    readColors();
    draw();
  };

  readColors();
  resize();

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const themeObserver = new MutationObserver(onThemeChange);
  themeObserver.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  root.addEventListener('mouseleave', onPointerGone);
  window.addEventListener('blur', onPointerGone);
  document.addEventListener('visibilitychange', onVisibility);
  finePointer.addEventListener('change', onModeChange);
  reducedMotion.addEventListener('change', onModeChange);

  return () => {
    stop();
    resizeObserver.disconnect();
    themeObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('mouseleave', onPointerGone);
    window.removeEventListener('blur', onPointerGone);
    document.removeEventListener('visibilitychange', onVisibility);
    finePointer.removeEventListener('change', onModeChange);
    reducedMotion.removeEventListener('change', onModeChange);
  };
}
