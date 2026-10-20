import { useEffect, useState } from 'react';

/**
 * Refraction for the liquid glass panes.
 *
 * A displacement map is drawn on a canvas once: neutral grey in the middle and a growing outward push near the
 * edges, like light bending through the thick rim of a lens. An SVG filter displaces the backdrop with that map and
 * the panes apply it with `backdrop-filter: url(#…)`. A per-channel split (chromatic aberration) was tried and
 * dropped: on our bright wallpapers it turned every rim into a neon rainbow.
 *
 * Only Chromium renders SVG filters inside backdrop-filter, so the effect is switched on with data-refract="on"
 * there; other browsers keep the plain frosted blur.
 */

const SIZE = 256;

function displacementMap(rim: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const image = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / (SIZE - 1);
      const v = y / (SIZE - 1);
      // Distance to the nearest edge, 0 at the edge and 0.5 in the middle.
      const edge = Math.min(u, 1 - u, v, 1 - v);
      const t = Math.max(0, 1 - edge / rim);
      const strength = t * t * (3 - 2 * t); // smoothstep: soft start, strong right at the rim
      // Near the rim, sample from further inside the pane: the backdrop looks compressed and bent toward the
      // centre, as through a thick glass edge. Sampling outward instead would read pixels outside the pane,
      // which the filter sees as transparent, and the colour channels would split into a rainbow halo.
      const dx = 0.5 - u;
      const dy = 0.5 - v;
      const len = Math.hypot(dx, dy) || 1;
      const i = (y * SIZE + x) * 4;
      image.data[i] = 128 + (dx / len) * strength * 127;
      image.data[i + 1] = 128 + (dy / len) * strength * 127;
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL('image/png');
}

function RefractionFilter({ id, map, scale }: { id: string; map: string; scale: number }) {
  return (
    <filter id={id} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
      <feImage href={map} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
      <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="bent" />
      <feGaussianBlur in="bent" stdDeviation="0.3" />
    </filter>
  );
}

export function LiquidGlassDefs() {
  const [maps, setMaps] = useState<{ pane: string; pill: string } | null>(null);

  useEffect(() => {
    const brands = (navigator as Navigator & { userAgentData?: { brands: { brand: string }[] } }).userAgentData?.brands ?? [];
    const chromium = brands.some((b) => b.brand === 'Chromium') || /Chrome\/\d+/.test(navigator.userAgent);
    const reduced = matchMedia('(prefers-reduced-transparency: reduce)').matches;
    if (!chromium || reduced) return;
    setMaps({ pane: displacementMap(0.16), pill: displacementMap(0.42) });
    document.documentElement.dataset.refract = 'on';
    return () => {
      delete document.documentElement.dataset.refract;
    };
  }, []);

  if (!maps) return null;
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* Large panes: a thin, strong rim. */}
        <RefractionFilter id="lg-pane" map={maps.pane} scale={16} />
        {/* Pills and buttons: the whole shape acts as a lens. */}
        <RefractionFilter id="lg-pill" map={maps.pill} scale={9} />
      </defs>
    </svg>
  );
}
