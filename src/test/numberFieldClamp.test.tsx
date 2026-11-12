import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NumberField } from "@/components/tools/ToolKit";

function Harness({ min, max, start = 12000 }: { min?: number; max?: number; start?: number }) {
  const [v, setV] = useState(start);
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

  it("shows the clamped value after blur even when the state was already at the bound", () => {
    render(<Harness start={0} />);
    const input = screen.getByLabelText("CIF") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "-500" } });
    expect(screen.getByTestId("v").textContent).toBe("0");
    fireEvent.blur(input);
    expect(input.value).toBe("0");
  });
});
