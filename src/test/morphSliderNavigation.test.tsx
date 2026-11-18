import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const glMocks = vi.hoisted(() => ({
  rendererInstances: 0,
  fromToCalls: [] as Array<{ target: { value: number }; toVars: { value: number; onComplete?: () => void } }>,
}));

vi.mock("ogl", () => {
  class Renderer {
    gl: {
      canvas: HTMLCanvasElement;
      clearColor: ReturnType<typeof vi.fn>;
      deleteTexture: ReturnType<typeof vi.fn>;
      deleteProgram: ReturnType<typeof vi.fn>;
      getExtension: ReturnType<typeof vi.fn>;
    };
    setSize = vi.fn();
    render = vi.fn();

    constructor() {
      glMocks.rendererInstances += 1;
      const canvas = document.createElement("canvas");
      this.gl = {
        canvas,
        clearColor: vi.fn(),
        deleteTexture: vi.fn(),
        deleteProgram: vi.fn(),
        getExtension: vi.fn(() => ({ loseContext: vi.fn() })),
      };
    }
  }

  class Triangle {}

  class Texture {
    texture = {};
    image?: unknown;
  }

  class Program {
    uniforms: Record<string, { value: unknown }>;
    program = {};
    constructor(_gl: unknown, opts: { uniforms: Record<string, { value: unknown }> }) {
      this.uniforms = opts.uniforms;
    }
  }

  class Mesh {}

  return { Renderer, Triangle, Program, Mesh, Texture };
});

vi.mock("gsap", () => ({
  gsap: {
    fromTo: vi.fn((target: { value: number }, _from: unknown, toVars: { value: number; onComplete?: () => void }) => {
      glMocks.fromToCalls.push({ target, toVars });
      return { kill: vi.fn() };
    }),
    to: vi.fn(() => ({ kill: vi.fn() })),
  },
}));

import MorphSlider from "@/components/MorphSlider";

const ITEMS = [
  { image: "https://example.com/slide-0.jpg" },
  { image: "https://example.com/slide-1.jpg" },
  { image: "https://example.com/slide-2.jpg" },
];

describe("MorphSlider direct navigation and context reuse", () => {
  beforeEach(() => {
    glMocks.rendererInstances = 0;
    glMocks.fromToCalls.length = 0;
  });

  it("jumps straight to the clicked indicator slide instead of stepping by 1", () => {
    const onIndexChange = vi.fn();
    render(<MorphSlider items={ITEMS} startIndex={0} onIndexChange={onIndexChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Go to slide 3" }));

    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(2);
    expect(glMocks.fromToCalls).toHaveLength(1);
  });

  it("transitions smoothly on startIndex updates without tearing down the WebGL renderer", () => {
    const onIndexChange = vi.fn();
    const { rerender } = render(
      <MorphSlider items={ITEMS} startIndex={0} onIndexChange={onIndexChange} />,
    );

    expect(glMocks.rendererInstances).toBe(1);

    rerender(<MorphSlider items={ITEMS} startIndex={2} onIndexChange={onIndexChange} />);

    expect(glMocks.rendererInstances).toBe(1);
    expect(onIndexChange).toHaveBeenCalledWith(2);
  });
});
