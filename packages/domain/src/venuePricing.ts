/** Admission facts and a user's spending allowance are separate values. */
export interface VenuePricing {
  cost: number;
  estimatedCost?: number;
  priceStatus?: 'free' | 'unknown' | 'estimate';
  priceLevel?: string | null;
  costLabel?: string;
  source?: string;
  budgetCategory?: string;
}

export function hasFreeAdmission(venue: VenuePricing): boolean {
  return venue.priceStatus === 'free' || venue.priceLevel === 'PRICE_LEVEL_FREE';
}

export function venuePriceLabel(venue: VenuePricing): string {
  if (hasFreeAdmission(venue)) return 'free entry · $0';
  const unknown = venue.priceStatus === 'unknown' ||
    (venue.source === 'google' && venue.priceStatus === 'estimate' &&
      (!venue.priceLevel || venue.priceLevel === 'PRICE_LEVEL_UNSPECIFIED'));
  if (unknown) return venue.cost > 0
    ? `price unconfirmed · $${venue.cost} planning allowance`
    : 'price unconfirmed';
  // A Google price level is a range, never an admission/menu quote.
  if (venue.source === 'google' && venue.priceLevel)
    return `~$${venue.cost} planning allowance`;
  return venue.costLabel || (venue.cost ? `~$${venue.cost} each` : '$0 allowance');
}

export function venueBudgetNote(venue: VenuePricing): string | null {
  if (!Number.isFinite(venue.estimatedCost) || venue.cost === venue.estimatedCost) return null;
  if (hasFreeAdmission(venue)) return `$${venue.cost} reserved budget · entry is free`;
  if (venue.priceStatus === 'unknown') return `$${venue.cost} budget · entry price unconfirmed`;
  return venue.budgetCategory === 'shopping'
    ? `$${Math.round((venue.cost - venue.estimatedCost!) * 100) / 100} for purchases · ~$${venue.estimatedCost} browsing allowance`
    : `$${venue.cost} budget · ~$${venue.estimatedCost} estimate`;
}
