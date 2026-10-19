import { useEffect, useRef } from 'react';

/**
 * The scene behind the glass: a soft colour field, two wide ribbons that sweep across the screen and a few
 * floating bubbles with a rim and a highlight. Colours come from the active wallpaper's CSS variables.
 *
 * The bubbles drift a little with the mouse for depth. That is the only scripted motion; the ribbons move with
 * a slow CSS animation. Both stop under prefers-reduced-motion and on touch screens.
 */
const BUBBLES = [
  { x: 14, y: 22, r: 46, depth: 0.6 },
  { x: 72, y: 64, r: 92, depth: 1 },
  { x: 88, y: 18, r: 34, depth: 0.4 },
  { x: 40, y: 82, r: 22, depth: 0.3 },
  { x: 58, y: 30, r: 16, depth: 0.25 },
  { x: 24, y: 58, r: 12, depth: 0.2 },
];

export function Wallpaper() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = matchMedia('(hover: hover) and (pointer: fine)');
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    let x = 0;
    let y = 0;

    const apply = () => {
      raf = 0;
      el.style.setProperty('--px', x.toFixed(3));
      el.style.setProperty('--py', y.toFixed(3));
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !fine.matches || still.matches) return;
      // -1..1 from the centre of the window.
      x = (e.clientX / window.innerWidth) * 2 - 1;
      y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="wallpaper" ref={ref} aria-hidden="true">
      <div className="wp-field" />
      <svg className="wp-ribbons" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wp-ribbon-a" x1="0" y1="0" x2="1" y2="0.4">
            <stop offset="0" stopColor="var(--wp-ribbon)" stopOpacity="0" />
            <stop offset="0.45" stopColor="var(--wp-ribbon)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--wp-ribbon)" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="wp-ribbon-b" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--wp-b)" stopOpacity="0.05" />
            <stop offset="0.6" stopColor="var(--wp-b)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--wp-b)" stopOpacity="0" />
          </linearGradient>
          <filter id="wp-soft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
        </defs>
        <g className="wp-ribbon wp-ribbon-1">
          <path
            d="M-120 640 C 260 420, 560 860, 980 560 S 1500 300, 1760 420 L 1760 560 C 1460 470, 1220 780, 900 760 S 260 640, -120 820 Z"
            fill="url(#wp-ribbon-a)"
            filter="url(#wp-soft)"
          />
        </g>
        <g className="wp-ribbon wp-ribbon-2">
          <path
            d="M-80 260 C 300 120, 640 420, 1040 250 S 1480 60, 1700 160 L 1700 250 C 1420 180, 1160 430, 860 420 S 300 260, -80 380 Z"
            fill="url(#wp-ribbon-b)"
            filter="url(#wp-soft)"
          />
        </g>
      </svg>
      {BUBBLES.map((b, i) => (
        <span
          key={i}
          className="wp-bubble"
          style={{
            left: `${b.x}%`,
            top: `${b.y}%`,
            width: b.r * 2,
            height: b.r * 2,
            ['--depth' as string]: b.depth,
            animationDelay: `${-i * 3.1}s`,
          }}
        />
      ))}
    </div>
  );
}
