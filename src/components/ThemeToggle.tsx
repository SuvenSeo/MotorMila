import { useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { m } from "motion/react";
import { useAppPreferences } from "@/lib/appPreferences";
import { usePrefersReducedMotionOrLowData } from "@/lib/motion";

type Particle = { id: number; delay: number; duration: number };

/* The switch is drawn at its natural size and scaled down to the 36px header row. */
const NATURAL_WIDTH = 104;
const NATURAL_HEIGHT = 64;
const THUMB_TRAVEL = 46;
const HEADER_HEIGHT = 36;
const SCALE = HEADER_HEIGHT / NATURAL_HEIGHT;

/**
 * Neumorphic light/dark switch for the site header.
 *
 * Reads and writes the app's own theme preference (appPreferences), so the
 * Settings page theme picker stays in sync. Choosing either side switches the
 * mode from "system" to that explicit mode. The ring that expands out of the
 * thumb on each flip carries a noise texture for grain, and is skipped entirely
 * when the visitor asks for reduced motion or is on a low-data connection.
 */
export function ThemeToggle() {
  const { resolvedTheme, setThemeMode, t } = useAppPreferences();
  const calm = usePrefersReducedMotionOrLowData();
  const isDark = resolvedTheme === "dark";
  const [particles, setParticles] = useState<Particle[]>([]);
  const clearTimer = useRef(0);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  const handleToggle = () => {
    setThemeMode(isDark ? "light" : "dark");
    if (calm) return;
    setParticles([0, 1, 2].map((id) => ({ id, delay: id * 0.1, duration: 0.6 + id * 0.1 })));
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setParticles([]), 1000);
  };

  const label = `${t("ui.theme", "Theme")}: ${isDark ? t("theme.light", "Light") : t("theme.dark", "Dark")}`;

  return (
    <span className="relative inline-flex h-9 w-[58.5px] shrink-0 items-center justify-center">
      <span
        className="shrink-0"
        style={{ width: NATURAL_WIDTH, height: NATURAL_HEIGHT, transform: `scale(${SCALE})` }}
      >
        <m.button
          type="button"
          onClick={handleToggle}
          className="relative flex items-center rounded-full p-[6px] outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          style={{
            width: NATURAL_WIDTH,
            height: NATURAL_HEIGHT,
            background: isDark
              ? "radial-gradient(ellipse at top left, #1e293b 0%, #0f172a 40%, #020617 100%)"
              : "radial-gradient(ellipse at top left, #ffffff 0%, #f1f5f9 40%, #cbd5e1 100%)",
            boxShadow: isDark
              ? `
                inset 5px 5px 12px rgba(0, 0, 0, 0.9),
                inset -5px -5px 12px rgba(71, 85, 105, 0.4),
                inset 8px 8px 16px rgba(0, 0, 0, 0.7),
                inset -8px -8px 16px rgba(100, 116, 139, 0.2),
                inset 0 2px 4px rgba(0, 0, 0, 1),
                inset 0 -2px 4px rgba(71, 85, 105, 0.4),
                inset 0 0 20px rgba(0, 0, 0, 0.6),
                0 1px 1px rgba(255, 255, 255, 0.05),
                0 2px 4px rgba(0, 0, 0, 0.4),
                0 8px 16px rgba(0, 0, 0, 0.4),
                0 16px 32px rgba(0, 0, 0, 0.3)
              `
              : `
                inset 5px 5px 12px rgba(148, 163, 184, 0.5),
                inset -5px -5px 12px rgba(255, 255, 255, 1),
                inset 8px 8px 16px rgba(100, 116, 139, 0.3),
                inset -8px -8px 16px rgba(255, 255, 255, 0.9),
                inset 0 2px 4px rgba(148, 163, 184, 0.4),
                inset 0 -2px 4px rgba(255, 255, 255, 1),
                inset 0 0 20px rgba(203, 213, 225, 0.3),
                0 1px 2px rgba(255, 255, 255, 1),
                0 2px 4px rgba(0, 0, 0, 0.1),
                0 8px 16px rgba(0, 0, 0, 0.08),
                0 16px 32px rgba(0, 0, 0, 0.06)
              `,
            border: isDark ? "2px solid rgba(51, 65, 85, 0.6)" : "2px solid rgba(203, 213, 225, 0.6)",
          }}
          aria-label={label}
          role="switch"
          aria-checked={isDark}
          whileTap={{ scale: 0.98 }}
        >
          {/* Deep inner groove/rim effect */}
          <span
            className="pointer-events-none absolute inset-[3px] rounded-full"
            style={{
              boxShadow: isDark
                ? "inset 0 2px 6px rgba(0, 0, 0, 0.9), inset 0 -1px 3px rgba(71, 85, 105, 0.3)"
                : "inset 0 2px 6px rgba(100, 116, 139, 0.4), inset 0 -1px 3px rgba(255, 255, 255, 0.8)",
            }}
          />

          {/* Multi-layer glossy overlay */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: isDark
                ? `
                  radial-gradient(ellipse at top, rgba(71, 85, 105, 0.15) 0%, transparent 50%),
                  linear-gradient(to bottom, rgba(71, 85, 105, 0.2) 0%, transparent 30%, transparent 70%, rgba(0, 0, 0, 0.3) 100%)
                `
                : `
                  radial-gradient(ellipse at top, rgba(255, 255, 255, 0.8) 0%, transparent 50%),
                  linear-gradient(to bottom, rgba(255, 255, 255, 0.7) 0%, transparent 30%, transparent 70%, rgba(148, 163, 184, 0.15) 100%)
                `,
              mixBlendMode: "overlay",
            }}
          />

          {/* Ambient occlusion effect */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              boxShadow: isDark ? "inset 0 0 15px rgba(0, 0, 0, 0.5)" : "inset 0 0 15px rgba(148, 163, 184, 0.2)",
            }}
          />

          {/* Background icons */}
          <span className="absolute inset-0 flex items-center justify-between px-4" aria-hidden>
            <Sun size={20} className={isDark ? "text-yellow-100" : "text-amber-600"} />
            <Moon size={20} className={isDark ? "text-yellow-100" : "text-slate-700"} />
          </span>

          {/* Thumb */}
          <m.span
            className="relative z-10 flex h-[44px] w-[44px] items-center justify-center overflow-hidden rounded-full"
            style={{
              background: isDark
                ? "linear-gradient(145deg, #64748b 0%, #475569 50%, #334155 100%)"
                : "linear-gradient(145deg, #ffffff 0%, #fefefe 50%, #f8fafc 100%)",
              boxShadow: isDark
                ? `
                  inset 2px 2px 4px rgba(100, 116, 139, 0.4),
                  inset -2px -2px 4px rgba(0, 0, 0, 0.8),
                  inset 0 1px 1px rgba(255, 255, 255, 0.15),
                  0 1px 2px rgba(255, 255, 255, 0.1),
                  0 8px 32px rgba(0, 0, 0, 0.6),
                  0 4px 12px rgba(0, 0, 0, 0.5)
                `
                : `
                  inset 2px 2px 4px rgba(203, 213, 225, 0.3),
                  inset -2px -2px 4px rgba(255, 255, 255, 1),
                  inset 0 1px 2px rgba(255, 255, 255, 1),
                  0 1px 2px rgba(255, 255, 255, 1),
                  0 8px 32px rgba(0, 0, 0, 0.18),
                  0 4px 12px rgba(0, 0, 0, 0.12)
                `,
              border: isDark ? "2px solid rgba(148, 163, 184, 0.3)" : "2px solid rgba(255, 255, 255, 0.9)",
            }}
            animate={{ x: isDark ? THUMB_TRAVEL : 0 }}
            transition={calm ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 20 }}
          >
            {/* Glossy shine overlay on thumb */}
            <span
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                background:
                  "linear-gradient(to bottom, rgba(255, 255, 255, 0.4) 0%, transparent 40%, rgba(0, 0, 0, 0.1) 100%)",
                mixBlendMode: "overlay",
              }}
            />

            {/* Grain rings expanding out of the thumb on each flip */}
            {particles.map((particle) => (
              <span key={particle.id} className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <m.span
                  className="absolute rounded-full"
                  style={{
                    width: "10px",
                    height: "10px",
                    background: isDark
                      ? "radial-gradient(circle, rgba(147, 197, 253, 0.5) 0%, rgba(147, 197, 253, 0) 70%)"
                      : "radial-gradient(circle, rgba(251, 191, 36, 0.7) 0%, rgba(251, 191, 36, 0) 70%)",
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: isDark ? 6 : 8, opacity: [0, 1, 0] }}
                  transition={{
                    duration: isDark ? 0.5 : particle.duration,
                    delay: particle.delay,
                    ease: "easeOut",
                  }}
                >
                  <span
                    className="absolute inset-0 rounded-full opacity-40"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                      mixBlendMode: "overlay",
                    }}
                  />
                </m.span>
              </span>
            ))}

            <span className="relative z-10" aria-hidden>
              {isDark ? (
                <Moon size={20} className="text-yellow-200" />
              ) : (
                <Sun size={20} className="text-amber-500" />
              )}
            </span>
          </m.span>
        </m.button>
      </span>
    </span>
  );
}
