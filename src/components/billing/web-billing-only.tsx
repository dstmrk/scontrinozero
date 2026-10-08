"use client";

import { useIsNativeShell } from "@/lib/native/native-shell";

/**
 * Rende i figli solo fuori dal guscio nativo (issue #1044).
 *
 * Dall'app iOS/Android non ci si abbona: App Store 3.1.1/3.1.3(f) e la
 * Payments policy di Google Play vietano dentro l'app sia l'acquisto sia
 * qualunque link o call to action verso un acquisto altrove. Checkout, scelta
 * del piano, prezzi, portale Stripe e CTA "Passa a Pro" passano da qui (o da
 * `useIsNativeShell` nei client component); lo stato del piano resta visibile.
 *
 * Client component sottile, così i server component (card impostazioni,
 * `ProFeatureGate`) restano server: avvolgono solo il link.
 *
 * L'HTML del server contiene la CTA (lo snapshot server di `useIsNativeShell`
 * è `false`): nel guscio sparisce all'idratazione.
 */
export function WebBillingOnly({
  children,
  nativeFallback = null,
}: Readonly<{
  children: React.ReactNode;
  nativeFallback?: React.ReactNode;
}>) {
  return useIsNativeShell() ? nativeFallback : children;
}
