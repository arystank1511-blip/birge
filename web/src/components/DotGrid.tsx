import { useEffect, useRef } from 'react';
import { mountDotGrid } from '../dotGrid';

/** Full-screen dot grid behind the app that warps away from the mouse. Purely decorative. */
export function DotGrid() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? mountDotGrid(ref.current) : undefined), []);
  return <canvas ref={ref} className="dot-grid" aria-hidden="true" />;
}
