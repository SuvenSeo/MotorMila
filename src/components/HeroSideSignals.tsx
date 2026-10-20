import { motion } from "framer-motion";
import {
  Building2,
  Flame,
  Layers,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useCountUp } from "@/hooks/useCountUp";
import { prefersReducedMotion, springSoft } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/services/api";
import { VehicleThumbnail } from "@/components/VehicleThumbnail";

type TrendingRow = {
  make: string;
  model: string;
  listing_count: number;
  avg_price_lkr?: number | null;
  thumbnail_url?: string | null;
};

type DealRow = {
  id: number;
  make: string;
  model: string;
  year?: number | null;
  price_lkr?: number | null;
  deal_score?: number | null;
  thumbnail_url?: string | null;
};

type PriceDropRow = {
  id: number;
  make: string;
  model: string;
  year?: number | null;
  previous_price_lkr: number;
  new_price_lkr: number;
  drop_pct: number;
  thumbnail_url?: string | null;
};

type Props = {
  trending?: TrendingRow | null;
  hotDeal?: DealRow | null;
  priceDrop?: PriceDropRow | null;
  newListings24h?: number;
  goodDealsCount?: number;
  avgPriceLkr?: number | null;
  sourceCount?: number;
  districtCount?: number;
  onTrendingClick?: () => void;
  onBrowseNewest?: () => void;
  onGoodDealsClick?: () => void;
};

type Accent = "primary" | "emerald" | "amber" | "violet";
type FloatVariant = "a" | "b" | "c";

/**
 * A single glass chip. Three of these flank each side of the centred hero
 * lockup, so they stay compact: one hairline label and one value line.
 */
function SignalChip({
  label,
  value,
  accent = "primary",
  float = "a",
  delay = 0,
  icon,
  thumb,
  align = "left",
  onClick,
  to,
  ariaLabel,
}: {
  label: string;
  value: React.ReactNode;
  accent?: Accent;
  float?: FloatVariant;
  delay?: number;
  icon: React.ComponentType<{ className?: string }>;
  thumb?: React.ReactNode;
  align?: "left" | "right";
  onClick?: () => void;
  to?: string;
  ariaLabel?: string;
}) {
  const reduced = prefersReducedMotion();
  const Icon = icon;

  const inner = (
    <span className={cn("flex w-full items-center gap-3", align === "right" && "flex-row-reverse text-right")}>
      {thumb ?? (
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-gradient-to-br from-white/[0.14] to-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
          <Icon className="h-5 w-5 text-primary drop-shadow-[0_2px_6px_hsl(var(--primary)/0.5)]" aria-hidden />
        </span>
      )}
      <span className={cn("min-w-0 flex-1", align === "right" && "items-end")}>
        <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className="mt-1 block truncate text-[15px] font-semibold tracking-tight text-foreground num">
          {value}
        </span>
      </span>
    </span>
  );

  const shellClass = cn(
    "hero-signal-card group block w-full p-3.5 pr-4 no-underline outline-none",
    `hero-signal-card--accent-${accent}`,
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, x: align === "left" ? -12 : 12 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ delay, ...springSoft }}
      className={cn(
        "hero-signal-float-wrap",
        `hero-signal-float-wrap--float-${float}`,
        !reduced && "hero-signal-float-wrap--animate",
      )}
    >
      <div className={shellClass}>
        <span className="hero-signal-card__glow" aria-hidden />
        <span className="relative z-10 block">
          {to ? (
            <Link
              to={to}
              aria-label={ariaLabel}
              className="flex w-full items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {inner}
            </Link>
          ) : onClick ? (
            <button
              type="button"
              onClick={onClick}
              aria-label={ariaLabel}
              className="flex w-full items-center rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              {inner}
            </button>
          ) : (
            <span className="flex w-full items-center">{inner}</span>
          )}
        </span>
      </div>
    </motion.div>
  );
}

function MetricValue({ value, fallback }: { value: number; fallback: string }) {
  const display = useCountUp(value > 0 ? value : 0, 1400);
  if (value <= 0) return <>{fallback}</>;
  return <>{display.toLocaleString()}</>;
}

function ListingThumb({
  src,
  listingId,
  alt,
  ring,
}: {
  src?: string | null;
  listingId?: number;
  alt: string;
  ring: string;
}) {
  return (
    <span className={cn("hero-signal-thumb h-12 w-[72px] shrink-0 bg-black/25 ring-1", ring)}>
      <VehicleThumbnail
        src={src}
        listingId={listingId}
        alt={alt}
        priority
        sizes="48px"
        className="h-full w-full object-cover"
        placeholderClassName="flex h-full w-full items-center justify-center bg-black/10"
      />
    </span>
  );
}

export function HeroSideSignals({
  trending,
  hotDeal,
  priceDrop,
  newListings24h = 0,
  goodDealsCount = 0,
  avgPriceLkr,
  sourceCount = 0,
  districtCount = 0,
  onTrendingClick,
  onBrowseNewest,
  onGoodDealsClick,
}: Props) {
  const railClass =
    "pointer-events-none absolute inset-y-0 hidden w-[min(22vw,284px)] xl:flex xl:flex-col xl:justify-center";
  const stackClass = "pointer-events-auto flex flex-col gap-4 px-1";

  return (
    <>
      {/* Left rail — what buyers are watching */}
      <div className={cn(railClass, "left-0 items-start")}>
        <div className={stackClass}>
          {trending ? (
            <SignalChip
              delay={0.06}
              accent="primary"
              float="a"
              label="Trending now"
              icon={TrendingUp}
              thumb={
                <ListingThumb
                  src={trending.thumbnail_url}
                  alt={`${trending.make} ${trending.model}`}
                  ring="ring-primary/25"
                />
              }
              value={`${trending.make} ${trending.model}`}
              ariaLabel={`Trending: ${trending.make} ${trending.model}, ${trending.listing_count} listed`}
              onClick={onTrendingClick}
            />
          ) : null}

          {priceDrop ? (
            <SignalChip
              delay={0.16}
              accent="emerald"
              float="b"
              label="Fresh price cut"
              icon={TrendingDown}
              thumb={
                <ListingThumb
                  src={priceDrop.thumbnail_url}
                  listingId={priceDrop.id}
                  alt={`${priceDrop.make} ${priceDrop.model}`}
                  ring="ring-emerald-400/30"
                />
              }
              value={`−${priceDrop.drop_pct}% · ${formatPrice(priceDrop.new_price_lkr)}`}
              ariaLabel={`${priceDrop.make} ${priceDrop.model} cut ${priceDrop.drop_pct}% to ${formatPrice(priceDrop.new_price_lkr)}`}
              to={`/listing/${priceDrop.id}`}
            />
          ) : null}

          {newListings24h > 0 ? (
            <SignalChip
              delay={0.26}
              accent="violet"
              float="c"
              label="New in 24h"
              icon={Zap}
              value={
                <span>
                  +
                  <MetricValue value={newListings24h} fallback="—" />
                </span>
              }
              ariaLabel={`${newListings24h} listings added in the last 24 hours`}
              onClick={onBrowseNewest}
            />
          ) : null}
        </div>
      </div>

      {/* Right rail — where the value is */}
      <div className={cn(railClass, "right-0 items-end")}>
        <div className={stackClass}>
          {hotDeal ? (
            <SignalChip
              delay={0.12}
              accent="amber"
              float="b"
              align="right"
              label="Top deal"
              icon={Flame}
              thumb={
                <ListingThumb
                  src={hotDeal.thumbnail_url}
                  alt={`${hotDeal.make} ${hotDeal.model}`}
                  ring="ring-amber-400/30"
                />
              }
              value={`${hotDeal.price_lkr ? formatPrice(hotDeal.price_lkr) : "—"}${
                hotDeal.deal_score ? ` · ${Number(hotDeal.deal_score).toFixed(1)}` : ""
              }`}
              ariaLabel={`Top deal: ${hotDeal.make} ${hotDeal.model}`}
              to={`/listing/${hotDeal.id}`}
            />
          ) : null}

          {goodDealsCount > 0 ? (
            <SignalChip
              delay={0.2}
              accent="primary"
              float="c"
              align="right"
              label="Score 8+ deals"
              icon={Sparkles}
              value={<MetricValue value={goodDealsCount} fallback="—" />}
              ariaLabel={`${goodDealsCount} listings scoring 8 or better`}
              onClick={onGoodDealsClick}
            />
          ) : null}

          {avgPriceLkr && avgPriceLkr > 0 ? (
            <SignalChip
              delay={0.28}
              accent="emerald"
              float="a"
              align="right"
              label="Market average"
              icon={Layers}
              value={`${formatPrice(avgPriceLkr)}${sourceCount ? ` · ${sourceCount} src` : ""}`}
              ariaLabel={`Market average asking price ${formatPrice(avgPriceLkr)} across ${sourceCount} sources`}
            />
          ) : districtCount > 0 ? (
            <SignalChip
              delay={0.28}
              accent="emerald"
              float="a"
              align="right"
              label="Coverage"
              icon={Building2}
              value={`${districtCount} districts`}
              ariaLabel={`Live inventory across ${districtCount} districts`}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
