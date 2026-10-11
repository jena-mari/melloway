import { useState } from "react";
import {
  budgetCategories,
  allocateActivityBudgets,
  validActivityBudgets,
} from "../utils/activityBudget";
import { transportAllowance } from "../utils/planner";

export default function BudgetSplit({ plan, busy, onApply }) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      budgetCategories.map(({ id }) => [
        id,
        plan.prefs.activityBudgets?.[id] ?? "",
      ]),
    ),
  );
  const [error, setError] = useState("");
  const budgets = plan.budgetBreakdown
    ? plan
    : allocateActivityBudgets(
        plan.stops,
        plan.prefs,
        transportAllowance(plan.prefs.transport),
      );
  async function apply(caps) {
    const reserved = Object.values(caps).reduce(
      (sum, amount) => sum + Math.round(amount * 100),
      0,
    );
    if (
      !validActivityBudgets(caps) ||
      reserved + transportAllowance(plan.prefs.transport) * 100 >
        Math.round(Number(plan.prefs.budget) * 100)
    ) {
      setError(
        `Keep activity budgets plus transport within $${plan.prefs.budget} each.`,
      );
      return;
    }
    setError("");
    const message = await onApply(caps);
    if (message) setError(message);
  }
  return (
    <form
      className="budget-split"
      aria-label="Activity budgets"
      onSubmit={(event) => {
        event.preventDefault();
        apply(
          Object.fromEntries(
            Object.entries(values)
              .filter(([, value]) => value !== "")
              .map(([key, value]) => [key, Number(value)]),
          ),
        );
      }}
      noValidate
    >
      <h3>budget split</h3>
      <div className="budget-split-note">AUD each · blank = auto</div>
      {budgetCategories.map(({ id, label }) => (
        <label key={id} className="budget-split-row">
          <span>{label}</span>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            max={plan.prefs.budget}
            step="0.01"
            aria-label={`${label} budget`}
            value={values[id]}
            placeholder={`auto · $${budgets?.budgetBreakdown[id].allowance ?? 0}`}
            disabled={busy}
            onChange={(event) => {
              setValues((old) => ({ ...old, [id]: event.target.value }));
              setError("");
            }}
          />
        </label>
      ))}
      <div className="budget-split-note">
        ${plan.prefs.budget} total · ${transportAllowance(plan.prefs.transport)}{" "}
        transport
        {budgets && <> · ${budgets.budgetUnassigned} unassigned</>}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="budget-split-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setValues(
              Object.fromEntries(budgetCategories.map(({ id }) => [id, ""])),
            );
            apply({});
          }}
        >
          reset to auto
        </button>
        <button type="submit" className="button pink" disabled={busy}>
          apply
        </button>
      </div>
    </form>
  );
}
