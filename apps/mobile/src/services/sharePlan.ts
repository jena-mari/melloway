import { formatItineraryText, type ItineraryTextInput } from './itineraryText.ts';

export type SharePlanOutcome = 'completed' | 'cancelled' | 'failed';
type TextSharer = (content: { message: string }) => Promise<{ action?: string } | void>;

/** The platform share sheet is invoked only by the caller's explicit button press. */
export async function sharePlanText(plan: ItineraryTextInput, share: TextSharer): Promise<SharePlanOutcome> {
  try {
    const result = await share({ message: formatItineraryText(plan) });
    return result?.action === 'dismissedAction' ? 'cancelled' : 'completed';
  } catch (reason) {
    // Web Share cancellation rejects with AbortError; iOS resolves with dismissedAction.
    if (typeof reason === 'object' && reason !== null && 'name' in reason && reason.name === 'AbortError') return 'cancelled';
    return 'failed';
  }
}
