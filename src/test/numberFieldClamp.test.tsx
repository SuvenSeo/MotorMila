import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NumberField } from "@/components/tools/ToolKit";

function Harness({ min, max }: { min?: number; max?: number }) {
  const [v, setV] = useState(12000);
  return (
    <>
      <NumberField id="f" label="CIF" value={v} onChange={setV} min={min} max={max} />
      <output data-testid="v">{v}</output>
    </>
  );
}

describe("NumberField clamps typed values", () => {
  it("never reports a value below min (default 0)", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("CIF"), { target: { value: "-500" } });
    expect(screen.getByTestId("v").textContent).toBe("0");
  });

  it("caps at max and passes in-range values through", () => {
    render(<Harness min={10} max={100} />);
    const input = screen.getByLabelText("CIF");
    fireEvent.change(input, { target: { value: "250" } });
    expect(screen.getByTestId("v").textContent).toBe("100");
    fireEvent.change(input, { target: { value: "42" } });
    expect(screen.getByTestId("v").textContent).toBe("42");
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByTestId("v").textContent).toBe("0");
  });
});
