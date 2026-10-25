import { memo, useMemo } from "react";
import type { DistrictVelocityPoint } from "@/types/car";
import {
  aggregateDistrictVelocityByProvince,
  provinceKey,
  type ProvinceVelocityPoint,
} from "@/lib/provinceMap";
import { useAppPreferences } from "@/lib/appPreferences";

interface ProvinceVelocityStripProps {
  data: DistrictVelocityPoint[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toRgb(hex: string) {
  const clean = hex.replace("#", "");
  const value = Number.parseInt(clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function lerpColor(from: string, to: string, ratio: number) {
  const s = toRgb(from);
  const e = toRgb(to);
  const t = clamp(ratio, 0, 1);
  return `rgb(${Math.round(s.r + (e.r - s.r) * t)}, ${Math.round(s.g + (e.g - s.g) * t)}, ${Math.round(s.b + (e.b - s.b) * t)})`;
}

function velocityColor(score: number, maxScore: number): string {
  if (maxScore <= 0) return "rgb(55, 65, 81)";
  const ratio = clamp(score / maxScore, 0, 1);
  if (ratio < 0.5) return lerpColor("#374151", "#14b8a6", ratio * 2);
  return lerpColor("#14b8a6", "#10b981", (ratio - 0.5) * 2);
}

function formatVelocityPct(score: number): string {
  return `${(score * 100).toFixed(1)}%`;
}

function ProvinceCell({
  point,
  maxScore,
  maxCount,
}: {
  point: ProvinceVelocityPoint;
  maxScore: number;
  maxCount: number;
}) {
  const { t } = useAppPreferences();
  const provinceName = t(provinceKey(point.province), point.province);
  const color = velocityColor(point.velocity_score, maxScore);
  const intensity = maxCount > 0 ? clamp(point.listing_count / maxCount, 0.18, 1) : 0.18;

  return (
    <article
      className="relative min-w-0 overflow-hidden rounded-xl border border-border px-3 py-3 transition-ui duration-medium ease-decelerate hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-soft"
      style={{
        background: `linear-gradient(160deg, ${color.replace("rgb", "rgba").replace(")", `, ${0.22 + intensity * 0.35})`)} 0%, rgba(17,17,17,0.85) 100%)`,
        boxShadow: `inset 0 0 0 1px ${color.replace("rgb", "rgba").replace(")", ", 0.25)")}`,
      }}
      title={t("provinceVelocity.cellTitle", "{province}: {pct} velocity · {n} listings", {
        province: provinceName,
        pct: formatVelocityPct(point.velocity_score),
        n: point.listing_count.toLocaleString(),
      })}
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: color, opacity: 0.85 }}
        aria-hidden
      />
      <p className="text-caption font-semibold text-foreground/90">
        {provinceName}
      </p>
      {/* Cell background is an always-dark data-viz gradient (not a theme surface), so text stays fixed-light regardless of theme */}
      <p className="mt-2 num text-callout font-semibold tracking-tight text-deal-good-text">
        {formatVelocityPct(point.velocity_score)}
      </p>
      <p className="mt-1 text-caption text-muted-foreground num">
        {t("provinceVelocity.listings", "{n} listings", { n: point.listing_count.toLocaleString() })}
      </p>
      <p className="mt-0.5 text-caption text-muted-foreground/80 num">
        {t("provinceVelocity.new7d", "+{n} new · 7d", { n: point.new_7d_count.toLocaleString() })}
      </p>
    </article>
  );
}

export const ProvinceVelocityStrip = memo(function ProvinceVelocityStrip({
  data,
  isLoading,
  isError,
  onRetry,
}: ProvinceVelocityStripProps) {
  const { t } = useAppPreferences();
  const provinces = useMemo(() => aggregateDistrictVelocityByProvince(data), [data]);

  const maxScore = useMemo(
    () => Math.max(0.001, ...provinces.map((p) => p.velocity_score)),
    [provinces],
  );
  const maxCount = useMemo(
    () => Math.max(1, ...provinces.map((p) => p.listing_count)),
    [provinces],
  );
  const hottest = useMemo(
    () =>
      provinces.length
        ? [...provinces].sort((a, b) => b.velocity_score - a.velocity_score)[0]
        : null,
    [provinces],
  );

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl border border-border bg-surface" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface px-4 py-6 text-center">
        <p className="text-footnote text-muted-foreground">
          {t("provinceVelocity.error", "Province velocity temporarily unavailable — market API returned an error.")}
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-2xl border border-border bg-card px-3 py-1.5 text-caption font-medium text-foreground transition-colors hover:border-primary/30 hover:text-primary-bright"
          >
            {t("common.retry", "Retry")}
          </button>
        ) : null}
      </div>
    );
  }

  if (!provinces.length) {
    return (
      <div className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-footnote text-muted-foreground">
        {t("provinceVelocity.empty", "Province velocity unavailable — district points not yet indexed.")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-caption font-semibold text-muted-foreground">
          <span className="rounded-2xl border border-border bg-surface px-2.5 py-1 text-foreground">
            {t("provinceVelocity.rollup", "Province rollup")}
          </span>
          <span className="rounded-2xl border border-border bg-surface px-2.5 py-1">
            {t("provinceVelocity.method", "Sum volume · weighted velocity")}
          </span>
        </div>
        {hottest ? (
          <p className="text-caption text-muted-foreground">
            {t("provinceVelocity.hottest", "Hottest:")}{" "}
            <span className="font-semibold text-deal-good-text">{t(provinceKey(hottest.province), hottest.province)}</span>
            <span className="num"> · {formatVelocityPct(hottest.velocity_score)}</span>
          </p>
        ) : null}
      </div>

      <div
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9"
        role="list"
        aria-label={t("provinceVelocity.aria", "Province demand velocity")}
      >
        {provinces.map((point) => (
          <div key={point.province} role="listitem">
            <ProvinceCell point={point} maxScore={maxScore} maxCount={maxCount} />
          </div>
        ))}
      </div>
    </div>
  );
});

ProvinceVelocityStrip.displayName = "ProvinceVelocityStrip";
