import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { scrollBehavior } from "@/lib/motion";

const HASH_RETRY_MS = 50;
const HASH_RETRY_LIMIT = 24;

function scrollToHashTarget(targetId: string) {
  const element = document.getElementById(targetId);
  if (!element) return false;

  element.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
  return true;
}

/** Reset scroll on route changes; preserve hash-anchor jumps on the homepage. */
export function ScrollRestoration() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const targetId = hash.replace("#", "");
      if (!targetId) return;

      if (scrollToHashTarget(targetId)) return;

      let attempts = 0;
      const retry = window.setInterval(() => {
        attempts += 1;
        if (scrollToHashTarget(targetId) || attempts >= HASH_RETRY_LIMIT) {
          window.clearInterval(retry);
        }
      }, HASH_RETRY_MS);

      return () => window.clearInterval(retry);
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);

  return null;
}
