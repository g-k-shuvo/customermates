const INVALID_FIELD_SELECTOR = '[aria-invalid="true"]';

export function revealFirstInvalidField(): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") return;

  window.requestAnimationFrame(() => {
    const field = document.querySelector<HTMLElement>(INVALID_FIELD_SELECTOR);
    if (!field) return;

    field.scrollIntoView({ block: "center", behavior: "smooth" });
    field.focus({ preventScroll: true });
  });
}
