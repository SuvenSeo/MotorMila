'use client';

/**
 * auth-11 — watermelon registry (https://registry.watermelon.sh/r/auth-11.json),
 * adapted for Motormila sign-in. Split layout: a rounded cinematic image panel
 * (crossfading Sri Lanka night-drive scenes, headline + working pagination) and
 * a staggered spring form column supplied by the page (see pages/SignIn.tsx).
 * The original comp's Google/Apple buttons were removed by product decision:
 * the backend is email/password only. Dark-first per the brand bible; the
 * `theme-dark` class keeps shared components (Button, ResendVerification) on
 * dark tokens regardless of the app theme.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { m, useReducedMotion, type Variants } from 'motion/react';
import type { VisualAsset } from '@/lib/visualAssets';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 15 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
};

/** One staggered block inside the form column. */
export function Auth11Item({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <m.div variants={itemVariants} className={className}>
      {children}
    </m.div>
  );
}

type Auth11Props = {
  /** Night-drive scenes for the image panel (full + small srcSet pairs). */
  slides: VisualAsset[];
  /** Headline at the foot of the image: lead, then an italic blue accent. */
  panelTitle: { lead: string; accent: string };
  /** Accessible label for pagination dot n (1-based). */
  slideLabel: (n: number) => string;
  /** Form column content, wrapped in Auth11Item blocks. */
  children: ReactNode;
};

export default function Auth11({ slides, panelTitle, slideLabel, children }: Auth11Props) {
  const [active, setActive] = useState(0);
  const reduced = useReducedMotion();

  // Auto-advance the crossfade; a manual dot pick restarts the countdown.
  // Reduced motion: no auto-advance, dots still switch (opacity only).
  useEffect(() => {
    if (reduced || slides.length < 2) return;
    const id = window.setInterval(() => setActive((a) => (a + 1) % slides.length), 6000);
    return () => window.clearInterval(id);
  }, [reduced, slides.length, active]);

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-background font-sans text-foreground antialiased selection:bg-[#0A7AFF]/40 selection:text-white lg:flex-row">
      {/* Image panel — a band on top on mobile, the tall left half on desktop */}
      <div className="relative w-full p-4 pb-0 lg:flex lg:min-h-screen lg:w-1/2 lg:flex-col lg:justify-end lg:pb-4">
        <div className="relative h-[36vh] min-h-[240px] w-full overflow-hidden rounded-[28px] border border-white/10 shadow-2xl lg:h-full lg:min-h-0 lg:flex-1 lg:rounded-[32px]">
          {slides.map((slide, i) => (
            <m.img
              key={slide.src}
              src={slide.src}
              srcSet={`${slide.srcSm} 960w, ${slide.src} 1024w`}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt=""
              initial={false}
              animate={{ opacity: i === active ? 1 : 0 }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
              className="absolute inset-0 h-full w-full object-cover"
              decoding="async"
            />
          ))}
          {/* Dark gradient for headline readability — doubled at the foot so
              white type holds even over bright wet-road glare. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-[#09090B]/90 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center justify-center px-6 pb-8 text-center lg:pb-12">
            <h2 className="text-balance text-2xl font-medium tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)] sm:text-3xl lg:text-4xl xl:text-5xl">
              {panelTitle.lead}{' '}
              <em className="italic text-[#6CB8FF]">{panelTitle.accent}</em>
            </h2>
            {/* Pagination — real controls, 24px tall hit areas */}
            <div className="mt-5 flex items-center justify-center gap-2 lg:mt-8">
              {slides.map((slide, i) => (
                <button
                  key={slide.src}
                  type="button"
                  aria-label={slideLabel(i + 1)}
                  aria-current={i === active}
                  onClick={() => setActive(i)}
                  className="group flex h-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <span
                    className={`block h-1 rounded-full transition-[width,background-color] duration-300 ${
                      i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/40 group-hover:bg-white/70'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-10 sm:px-12 lg:min-h-screen lg:w-1/2 lg:py-14">
        <m.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-[400px]"
        >
          {children}
        </m.div>
      </div>
    </div>
  );
}
