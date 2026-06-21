/** Return likely scroll containers used by the ERP shell. */
function getScrollContainers() {
  if (typeof document === "undefined") return [];
  return [
    document.scrollingElement,
    document.documentElement,
    document.body,
    document.querySelector(".workspace"),
    document.querySelector(".screen-host")
  ].filter(Boolean);
}

/** Reset visible ERP workspace scroll positions after route navigation. */
export function resetWorkspaceScroll() {
  getScrollContainers().forEach((container) => {
    try {
      container.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      if ("scrollTop" in container) container.scrollTop = 0;
      if ("scrollLeft" in container) container.scrollLeft = 0;
    } catch {
      // Some browser-provided scroll elements reject object syntax; direct assignment above remains safe.
    }
  });
}

/** Smooth-scroll to a target section and optionally focus its first useful control. */
export function scrollToSection(selector, focus = true) {
  window.setTimeout(() => {
    const target = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" });
    if (focus) {
      const input = target.querySelector?.('input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), button');
      window.setTimeout(() => input?.focus?.({ preventScroll: true }), 220);
    }
  }, 50);
}
