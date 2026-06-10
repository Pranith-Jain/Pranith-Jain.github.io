import type { Transfer, TracerChain } from './chain-sources/types';

export type AlertType = 'new_transfer' | 'suspicious_counterparty' | 'large_transfer';

export interface WatchRow {
  address: string;
  chain: TracerChain;
  alert_types: AlertType[];
  min_amount: number | null;
  webhook_url: string | null;
  label: string | null;
  added_at: string;
  last_checked: string | null;
  last_fingerprint: string | null;
}

export interface AlertRow {
  alert_type: AlertType;
  transfer: Transfer;
}

/** Net-new transfers since `lastFingerprint`. Transfers are newest-first. Pure. */
export function diffTransfers(transfers: Transfer[], lastFingerprint: string | null): Transfer[] {
  if (!lastFingerprint) return transfers;
  const idx = transfers.findIndex((t) => t.tx_hash === lastFingerprint);
  return idx === -1 ? transfers : transfers.slice(0, idx);
}

/** Evaluate a watch's alert types against the net-new transfers. Pure. */
export function evaluateAlerts(
  watch: WatchRow,
  newTransfers: Transfer[],
  sanctioned: Set<string>,
  scam: Set<string>
): AlertRow[] {
  const out: AlertRow[] = [];
  const types = new Set(watch.alert_types);
  for (const t of newTransfers) {
    if (types.has('new_transfer')) out.push({ alert_type: 'new_transfer', transfer: t });
    if (types.has('large_transfer') && watch.min_amount != null && t.amount_num >= watch.min_amount) {
      out.push({ alert_type: 'large_transfer', transfer: t });
    }
    if (types.has('suspicious_counterparty')) {
      const lc = t.counterparty.toLowerCase();
      const key = watch.chain === 'evm' ? lc : t.counterparty;
      if (sanctioned.has(key) || scam.has(lc)) out.push({ alert_type: 'suspicious_counterparty', transfer: t });
    }
  }
  return out;
}
