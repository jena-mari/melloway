export const MAX_PLAN_TITLE_LENGTH = 80;

export function cleanPlanTitle(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

// Cloud route updates still win, except for a more recent local name edit.
export function mergeSavedPlans(local, remote) {
  const plans = new Map(local.map(plan => [plan.id, plan]));
  for (const plan of remote) {
    const existing = plans.get(plan.id);
    const localEdit = Date.parse(existing?.titleUpdatedAt) || 0;
    const cloudEdit = Date.parse(plan.titleUpdatedAt) || 0;
    plans.set(plan.id, existing?.title && localEdit > cloudEdit
      ? { ...plan, title: existing.title, titleUpdatedAt: existing.titleUpdatedAt }
      : plan);
  }
  return [...plans.values()];
}
