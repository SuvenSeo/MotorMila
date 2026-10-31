import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/lib/appPreferences";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { trackEvent } from "@/lib/analytics";
import MobileApp from "@/pages/MobileApp";
import release from "../../public/app/latest-release.json";

const APK = release.apk_url;

function renderPage() {
  return render(
    <AppPreferencesProvider>
      <MemoryRouter initialEntries={["/mobile-app"]}>
        <MobileApp />
      </MemoryRouter>
    </AppPreferencesProvider>,
  );
}

describe("MobileApp page", () => {
  it("renders one h1, every download link points at the current APK, and clicks are tracked", () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const downloads = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.endsWith(".apk"));
    expect(downloads.length).toBeGreaterThanOrEqual(3);
    for (const link of downloads) expect(link).toHaveAttribute("href", APK);
    downloads[0].addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(downloads[0]);
    expect(trackEvent).toHaveBeenCalledWith("app_download_click", { placement: "hero", version: release.version });
  });

  it("links to the install steps and shows the checksum, signing cert and QR code", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /how to install/i })).toHaveAttribute("href", "#install");
    expect(document.getElementById("install")).not.toBeNull();
    expect(screen.getByText(release.sha256)).toBeInTheDocument();
    expect(screen.getByText("384420c0922cb84ee0e6866ab09b4e47e7012bf21c69e83f934304366f445217")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /qr code/i })).toBeInTheDocument();
  });

  it("lazy-loads below-the-fold screenshots with intrinsic sizes", () => {
    renderPage();
    const imgs = Array.from(document.querySelectorAll("img")).filter((img) => img.src.includes("screen-"));
    expect(imgs.length).toBe(6);
    for (const img of imgs) {
      expect(img).toHaveAttribute("width", "600");
      expect(img).toHaveAttribute("height", "1333");
      expect(img).toHaveAttribute("decoding", "async");
    }
    expect(imgs.filter((img) => img.getAttribute("loading") === "lazy")).toHaveLength(4);
  });
});
