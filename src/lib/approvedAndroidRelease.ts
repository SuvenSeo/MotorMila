import { z } from "zod";
import manifest from "./approvedAndroidStable.json";

// A source-reviewed selection, bundled with /mobile-app. No runtime input, remote
// manifest, tag, branch, Gradle version or caller-supplied URL is an approval.
const stable = z.strictObject({
  channel: z.literal("stable"),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  version_code: z.int().positive().max(2_100_000_000),
  bytes: z.int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  published_at: z.iso.datetime({ precision: 0 }),
});

export const RELEASE_CERT_SHA256 = manifest.signing_cert_sha256;
const revokedDigest = "d36d624adf29210e07a0232026b51f105cdaab4c561191d2cfb57f97bfa0e349";
const fallback = stable.extend({ version: z.literal("1.8.0"), version_code: z.literal(21) }).parse(manifest.fallback);

const newApproval = stable.refine((r) =>
  r.version_code > 23 && r.version !== "1.9.1" && r.version !== fallback.version &&
  r.sha256 !== revokedDigest && r.sha256 !== fallback.sha256,
);

export function selectApprovedRelease(approval: unknown) {
  const parsed = newApproval.safeParse(approval);
  const release = parsed.success ? parsed.data : fallback;
  return {
    ...release,
    apkUrl: `https://pub-f15911ef9a914db9a44e1fd6b47dfe4e.r2.dev/app/motormila-${release.version}.apk`,
    size: `${(release.bytes / 1_000_000).toFixed(1)} MB`,
  };
}

export const approvedAndroidRelease = selectApprovedRelease(manifest.approved);
