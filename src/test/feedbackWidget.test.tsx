import { act, render, screen } from "@testing-library/react";
import { TestRouter } from "@/test/testUtils";
import { describe, expect, it, vi } from "vitest";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { openFeedbackDialog } from "@/lib/feedbackEvents";

vi.mock("@/services/api", () => ({
  sendFeedback: vi.fn(),
}));

describe("FeedbackWidget", () => {
  it("has no floating trigger and opens from openFeedbackDialog()", async () => {
    render(
      <TestRouter initialEntries={["/?q=Toyota+Axio"]}>
        <FeedbackWidget />
      </TestRouter>,
    );

    expect(screen.queryByRole("button", { name: /send feedback/i })).not.toBeInTheDocument();

    act(() => openFeedbackDialog());

    expect(await screen.findByRole("dialog", { name: /send feedback/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /data issue/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/what should motormila fix or improve/i)).toBeInTheDocument();
  });
});
