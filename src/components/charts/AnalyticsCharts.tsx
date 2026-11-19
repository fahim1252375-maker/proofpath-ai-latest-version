import React, { useState } from 'react';

export interface ChartDatum {
  label: string;
  value: number;
  color: string;
}

export function HorizontalBarChart({
  title,
  subtitle,
  data,
  emptyLabel = 'No records yet',
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  emptyLabel?: string;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((acc, d) => acc + d.value, 0);

  return (
    <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{subtitle}</p>
          )}
        </div>
        <span className="font-mono text-xs text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">
          Total: {total}
        </span>
      </div>

      {total === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-[#E4E8E0] py-8 text-center text-xs text-[#5E6B5B] dark:border-[#232D27] dark:text-[#8C9A88]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 space-y-3" role="list" aria-label={title}>
          {data.map((d, idx) => {
            const pct = Math.round((d.value / maxVal) * 100);
            const share = Math.round((d.value / total) * 100);
            const isActive = hoveredIdx === idx;
            return (
              <div
                key={d.label}
                role="listitem"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                className="group"
              >
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-[#1D2520] dark:text-[#D5DDD2]">{d.label}</span>
                  <span className="font-mono text-[#5E6B5B] tabular-nums dark:text-[#8C9A88]">
                    {d.value} ({share}%)
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-sm bg-[#F0F1EA] dark:bg-[#1D2520]">
                  <div
                    className="h-full rounded-sm transition-all duration-300"
                    style={{
                      width: `${Math.max(d.value > 0 ? 4 : 0, pct)}%`,
                      backgroundColor: d.color,
                      opacity: hoveredIdx === null || isActive ? 1 : 0.5,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function DistributionRingChart({
  title,
  subtitle,
  data,
  emptyLabel = 'No records yet',
}: {
  title: string;
  subtitle?: string;
  data: ChartDatum[];
  emptyLabel?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = data.reduce((acc, d) => acc + d.value, 0);

  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;

  const activeDatum = selected !== null ? data[selected] : null;

  return (
    <div className="rounded-xl border border-[#E4E8E0] bg-white p-5 dark:border-[#232D27] dark:bg-[#141B17]">
      <div>
        <h3 className="font-display text-sm font-semibold text-[#101713] dark:text-[#F7F7F0]">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[#5E6B5B] dark:text-[#8C9A88]">{subtitle}</p>
        )}
      </div>

      {total === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-[#E4E8E0] py-8 text-center text-xs text-[#5E6B5B] dark:border-[#232D27] dark:text-[#8C9A88]">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
            <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90" role="img" aria-label={title}>
              <circle
                cx="66"
                cy="66"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="16"
                className="text-[#F0F1EA] dark:text-[#1D2520]"
              />
              {data.map((d, i) => {
                if (d.value <= 0) return null;
                const fraction = d.value / total;
                const dash = fraction * circumference;
                const offset = -cumulative * circumference;
                cumulative += fraction;
                return (
                  <circle
                    key={d.label}
                    cx="66"
                    cy="66"
                    r={radius}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={selected === i ? 19 : 16}
                    strokeDasharray={`${dash} ${circumference - dash}`}
                    strokeDashoffset={offset}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setSelected(i)}
                    onMouseLeave={() => setSelected(null)}
                  />
                );
              })}
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-xl font-bold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                {activeDatum ? activeDatum.value : total}
              </span>
              <span className="max-w-[78px] truncate text-[11px] text-[#5E6B5B] dark:text-[#8C9A88]">
                {activeDatum ? activeDatum.label : 'Total'}
              </span>
            </div>
          </div>

          <div className="w-full flex-1 space-y-2">
            {data.map((d, i) => (
              <button
                key={d.label}
                type="button"
                onMouseEnter={() => setSelected(i)}
                onMouseLeave={() => setSelected(null)}
                onFocus={() => setSelected(i)}
                onBlur={() => setSelected(null)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs transition-colors hover:bg-[#F7F7F0] dark:hover:bg-[#1D2520]"
              >
                <span className="flex items-center gap-2 text-[#1D2520] dark:text-[#D5DDD2]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: d.color }}
                    aria-hidden="true"
                  />
                  <span>{d.label}</span>
                </span>
                <span className="font-mono font-semibold text-[#101713] tabular-nums dark:text-[#F7F7F0]">
                  {d.value}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function IntelligenceScoreGauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label={`Opportunity Intelligence Score ${clamped} out of 100`}>
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
          className="text-[#2A352E]"
        />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#C5F36A"
          strokeWidth="12"
          strokeLinecap="butt"
          strokeDasharray={`${dash} ${circumference - dash}`}
          className="transition-all duration-500"
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-3xl font-bold text-[#F7F7F0] tabular-nums">{clamped}</span>
        <span className="font-mono text-[10px] tracking-wider text-[#8C9A88] uppercase">/ 100 Index</span>
      </div>
    </div>
  );
}
