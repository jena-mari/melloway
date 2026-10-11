interface Stop { id: string }
interface Result<T> { stops: T[]; travel: number; elapsed: number }

/** Search only permutations of selected stops; never add, replace or drop one.
 * Exhaustive for small routes, bounded for larger routes. Scheduling supplies
 * the hard hours, timeframe, budget and travel constraints on each prefix.
 */
export function reorderSelected<T extends Stop, P extends Result<T>>(
  stops: T[], evaluate: (stops: T[]) => P | null,
  mode: 'optimise' | 'shuffle', reasonable: (plan: P) => boolean = () => true,
): { plan: P | null; bounded: boolean } {
  if (!stops.length || stops.length > 14 || new Set(stops.map(s => s.id)).size !== stops.length)
    return { plan: null, bounded: false };
  const signature = stops.map(s => s.id).join('|');
  let best: P | null = null, nodes = 0, bounded = false;
  // Consider local swaps first so a bounded search can still improve long routes.
  function consider(order: T[]) {
    if (mode === 'shuffle' && order.map(s => s.id).join('|') === signature) return;
    const plan = evaluate(order);
    if (!plan || !reasonable(plan)) return;
    if (!best || plan.travel < best.travel || (plan.travel === best.travel && plan.elapsed < best.elapsed)) best = plan;
  }
  consider(stops);
  for (let a = 0; a < stops.length; a++) for (let b = a + 1; b < stops.length; b++) {
    const order = [...stops]; [order[a], order[b]] = [order[b], order[a]]; consider(order);
  }
  function visit(path: T[], used: Set<string>) {
    if (++nodes > 60000) { bounded = true; return; }
    if (path.length && !evaluate(path)) return;
    if (path.length === stops.length) { consider(path); return; }
    for (const stop of stops) {
      if (used.has(stop.id) || bounded) continue;
      used.add(stop.id); visit([...path, stop], used); used.delete(stop.id);
    }
  }
  visit([], new Set());
  return { plan: best, bounded };
}
