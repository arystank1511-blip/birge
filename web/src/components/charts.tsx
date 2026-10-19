/**
 * Small SVG charts drawn by hand: no chart library, so they inherit theme colours through CSS variables
 * and stay tiny in the bundle. Every chart has an accessible label; the numbers are also shown as text nearby.
 */

interface RingSpec {
  value: number;
  total: number;
  color: string;
}

/** Concentric progress rings, outermost first. */
export function Rings({ rings, size = 132, label }: { rings: RingSpec[]; size?: number; label: string }) {
  const stroke = 11;
  const gap = 4;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="rings">
      {rings.map((ring, i) => {
        const r = size / 2 - stroke / 2 - i * (stroke + gap);
        const c = 2 * Math.PI * r;
        const pct = ring.total > 0 ? Math.min(1, ring.value / ring.total) : 0;
        return (
          <g key={i} transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={ring.color} strokeOpacity={0.16} strokeWidth={stroke} />
            <circle
              className="ring-arc"
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={ring.color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - pct)}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Vertical bars with labels underneath; the highlighted bar uses the accent colour. */
export function Bars({
  values,
  labels,
  highlight,
  label,
}: {
  values: number[];
  labels: string[];
  highlight?: number;
  label: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="bars" role="img" aria-label={label}>
      {values.map((v, i) => (
        <div key={i} className={`bar${i === highlight ? ' bar-on' : ''}`} title={`${labels[i]}: ${v}`}>
          <span className="bar-value mono">{v || ''}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ height: `${(v / max) * 100}%` }} />
          </span>
          <span className="bar-label">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

interface Series {
  values: number[];
  color: string;
  dashed?: boolean;
  area?: boolean;
  name: string;
}

/** Line chart with optional area fill. Smooth curves, a light grid and first/middle/last x labels. */
export function LineChart({
  series,
  labels,
  height = 220,
  label,
  integerTicks = true,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  label: string;
  integerTicks?: boolean;
}) {
  const width = 600;
  const padTop = 12;
  const padBottom = 24;
  const padLeft = 28;
  const innerH = height - padTop - padBottom;
  const innerW = width - padLeft - 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const top = integerTicks ? Math.ceil(max / 2) * 2 : max;
  const n = Math.max(2, labels.length);
  const x = (i: number) => padLeft + (i / (n - 1)) * innerW;
  const y = (v: number) => padTop + innerH - (v / top) * innerH;

  const path = (values: number[]) => {
    // Monotone-ish smoothing: control points a third of the way between neighbours.
    return values
      .map((v, i) => {
        if (i === 0) return `M ${x(0)} ${y(v)}`;
        const x0 = x(i - 1);
        const x1 = x(i);
        const dx = (x1 - x0) / 3;
        return `C ${x0 + dx} ${y(values[i - 1])}, ${x1 - dx} ${y(v)}, ${x1} ${y(v)}`;
      })
      .join(' ');
  };

  const ticks = [0, top / 2, top];
  const labelIdx = [0, Math.floor((labels.length - 1) / 2), labels.length - 1];

  return (
    <svg className="line-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={padLeft} x2={width - 8} y1={y(t)} y2={y(t)} className="grid-line" />
          <text x={padLeft - 8} y={y(t) + 4} className="axis-text" textAnchor="end">
            {Math.round(t)}
          </text>
        </g>
      ))}
      {series.map((s) =>
        s.area ? (
          <path
            key={`${s.name}-area`}
            d={`${path(s.values)} L ${x(s.values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
            fill={s.color}
            fillOpacity={0.12}
          />
        ) : null,
      )}
      {series.map((s) => (
        <path
          key={s.name}
          d={path(s.values)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.dashed ? 1.6 : 2.4}
          strokeDasharray={s.dashed ? '5 5' : undefined}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {labelIdx.map((i, k) => (
        <text
          key={`${i}-${k}`}
          x={x(i)}
          y={height - 6}
          className="axis-text"
          textAnchor={k === 0 ? 'start' : k === 2 ? 'end' : 'middle'}
        >
          {labels[i]}
        </text>
      ))}
    </svg>
  );
}

/** Donut with a number in the middle. */
export function Donut({
  parts,
  center,
  caption,
  size = 150,
  label,
}: {
  parts: { value: number; color: string }[];
  center: string;
  caption: string;
  size?: number;
  label: string;
}) {
  const stroke = 18;
  const r = size / 2 - stroke / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--field-hover)" strokeWidth={stroke} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * c;
            // A hairline gap between slices keeps neighbours readable.
            const seg = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={stroke}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return seg;
          })}
      </svg>
      <div className="donut-center">
        <strong className="mono">{center}</strong>
        <span>{caption}</span>
      </div>
    </div>
  );
}
