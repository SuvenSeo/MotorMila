import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppPreferencesProvider } from "@/lib/appPreferences";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import { trackEvent } from "@/lib/analytics";
import MobileApp from "@/pages/MobileApp";
import manifest from "@/lib/approvedAndroidStable.json";

const release = manifest.approved ?? manifest.fallback;
const APK = `https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-${release.version}.apk`;

function renderPage() {
  return render(
    <AppPreferencesProvider>
      <MemoryRouter initialEntries={["/mobile-app?version=1.9.1&apk_url=https://example.invalid/file.apk"]}>
        <MobileApp />
      </MemoryRouter>
    </AppPreferencesProvider>,
  );
}

describe("MobileApp page", () => {
  it("shows the actual decimal download size and advises declining a different version", () => {
    renderPage();
    const size = `${(release.bytes / 1e6).toFixed(1)} MB`;
    expect(screen.getByText(`${size} (${release.bytes.toLocaleString("en-LK")} bytes)`)).toBeInTheDocument();
    expect(screen.getByText(`v${release.version} · ${size}`)).toBeInTheDocument();
    expect(screen.getAllByText(/choose Later/i).length).toBeGreaterThan(0);
  });

  it("offers only the approved APK across all placements, regardless of query parameters", () => {
    renderPage();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const downloads = screen.getAllByRole("link", { name: /Download APK/i });
    expect(downloads).toHaveLength(3);
    downloads.forEach((link, i) => {
      expect(link).toHaveAttribute("href", APK);
      link.addEventListener("click", (event) => event.preventDefault());
      fireEvent.click(link);
      expect(trackEvent).toHaveBeenCalledWith("app_download_click", { placement: ["hero", "trust", "cta"][i], version: release.version });
    });
    for (const link of screen.getAllByRole("link", { name: /browse on the web/i })) {
      expect(link).toHaveAttribute("href", "/");
    }
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
