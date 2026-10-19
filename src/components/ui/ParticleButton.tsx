import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
} from "react";
import { cn } from "@/lib/utils";

export type ParticleButtonHandle = {
  /** Fire a particle burst from the button's center. No-op under reduced motion. */
  burst: () => void;
};

type ParticleButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Particle palette. Defaults to brand + celebratory tones. */
  particleColors?: string[];
  /** Burst on every click as well as on demand via ref. Defaults to false. */
  burstOnClick?: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  circle: boolean;
};

const DEFAULT_COLORS = ["#7c5cff", "#22c55e", "#f59e0b", "#38bdf8", "#f472b6", "#ffffff"];

/**
 * KokonutUI-style particle button. Looks and behaves like the button it
 * replaces; on `burst()` (or click, when `burstOnClick`) it fires a short
 * canvas confetti burst from its center. Zero dependencies — a ~90-line
 * canvas + rAF engine. Respects prefers-reduced-motion.
 */
export const ParticleButton = forwardRef<ParticleButtonHandle, ParticleButtonProps>(
  function ParticleButton(
    { className, particleColors = DEFAULT_COLORS, burstOnClick = false, onClick, children, ...rest },
    ref,
  ) {
    const btnRef = useRef<HTMLButtonElement>(null);
    const rafRef = useRef<number>(0);

    const burst = useCallback(() => {
      const btn = btnRef.current;
      if (!btn) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const canvas = document.createElement("canvas");
      const size = Math.max(rect.width, rect.height) * 3;
      canvas.width = size;
      canvas.height = size;
      canvas.style.cssText = `position:fixed;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;pointer-events:none;z-index:80;`;
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        canvas.remove();
        return;
      }

      const origin = size / 2;
      const count = Math.min(42, Math.max(20, Math.round(rect.width / 4)));
      const particles: Particle[] = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = (0.25 + Math.random() * 0.75) * (size / 90);
        return {
          x: origin,
          y: origin,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - size / 220,
          life: 0,
          maxLife: 55 + Math.random() * 35,
          size: 2 + Math.random() * 4,
          color: particleColors[Math.floor(Math.random() * particleColors.length)],
          rotation: Math.random() * Math.PI * 2,
          spin: (Math.random() - 0.5) * 0.3,
          circle: Math.random() < 0.35,
        };
      });

      const tick = () => {
        ctx.clearRect(0, 0, size, size);
        let alive = false;
        for (const p of particles) {
          p.life += 1;
          if (p.life >= p.maxLife) continue;
          alive = true;
          p.vy += size / 9000; // gentle gravity
          p.vx *= 0.985;
          p.vy *= 0.99;
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.spin;
          const alpha = 1 - p.life / p.maxLife;
          ctx.save();
          ctx.globalAlpha = Math.max(0, alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillStyle = p.color;
          if (p.circle) {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          }
          ctx.restore();
        }
        if (alive) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          canvas.remove();
        }
      };
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(tick);
    }, [particleColors]);

    useImperativeHandle(ref, () => ({ burst }), [burst]);

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (burstOnClick) burst();
      onClick?.(e);
    };

    return (
      <button ref={btnRef} onClick={handleClick} className={cn(className)} {...rest}>
        {children}
      </button>
    );
  },
);
