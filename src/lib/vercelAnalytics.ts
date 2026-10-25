/**
 * Vercel Web Analytics serves its script from /_vercel/insights/script.js,
 * which only exists on Vercel deployments. On the Cloudflare Pages mirror
 * (*.pages.dev) and locally that path 404s and the browser logs a MIME-type
 * error on every page load, so only mount <Analytics /> on Vercel hosts.
 */
export function shouldLoadVercelAnalytics(hostname: string | undefined | null, override?: string | null): boolean {
	const flag = String(override || "").toLowerCase();
	if (flag === "on") return true;
	if (flag === "off") return false;
	const host = String(hostname || "").toLowerCase();
	if (!host) return false;
	if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return false;
	if (host.endsWith(".pages.dev")) return false;
	return true;
}
