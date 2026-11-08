export type BillingMenuAction = "payment-method" | "payment-history";

const BILLING_MENU_EVENT = "candid:billing-menu-action";

export function dispatchBillingMenuAction(action: BillingMenuAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<BillingMenuAction>(BILLING_MENU_EVENT, { detail: action }));
}

export function subscribeBillingMenuAction(listener: (action: BillingMenuAction) => void) {
  if (typeof window === "undefined") return () => {};
  const handleAction = (event: Event) => {
    if (event instanceof CustomEvent && isBillingMenuAction(event.detail)) {
      listener(event.detail);
    }
  };
  window.addEventListener(BILLING_MENU_EVENT, handleAction);
  return () => window.removeEventListener(BILLING_MENU_EVENT, handleAction);
}

function isBillingMenuAction(value: unknown): value is BillingMenuAction {
  return value === "payment-method" || value === "payment-history";
}
