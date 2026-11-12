import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Combobox } from "@/components/ui/combobox";

it("does not change selection when Enter is pressed on a closed filter", () => {
  const change = vi.fn();
  render(<Combobox label="Make" value="Toyota" options={[{ value: "Toyota", label: "Toyota" }]} onChange={change} />);
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  expect(change).not.toHaveBeenCalled();
});

it("restores focus to the filter trigger when Escape closes its search", () => {
  render(<Combobox label="Make" value={null} options={[]} onChange={vi.fn()} />);
  const trigger = screen.getByRole("combobox");
  fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
  expect(trigger).toHaveFocus();
});
