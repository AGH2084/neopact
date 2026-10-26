"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Lock, Save } from "lucide-react";
import {
  api,
  can,
  money,
  type Me,
  type Product,
  type Rules,
  type RulesInput,
} from "@/lib/api";

type Field = {
  key: string;
  label: string;
  help: string;
  unit: "money" | "percent" | "count";
};

const FIELDS: Record<"buyer" | "seller", Field[]> = {
  buyer: [
    {
      key: "max_total",
      label: "Maximum total per deal",
      help: "Your agent can never agree to a delivered total above this.",
      unit: "money",
    },
    {
      key: "max_deposit_percent",
      label: "Maximum deposit",
      help: "Highest upfront payment your agent may accept.",
      unit: "percent",
    },
  ],
  seller: [
    {
      key: "min_unit_price",
      label: "Minimum unit price",
      help: "Your private floor. Buyers never see it.",
      unit: "money",
    },
    {
      key: "max_discount_percent",
      label: "Maximum discount",
      help: "Largest discount from the listed price your agent may give.",
      unit: "percent",
    },
    {
      key: "min_deposit_percent",
      label: "Minimum deposit",
      help: "Lowest upfront payment your agent may accept.",
      unit: "percent",
    },
    {
      key: "discount_min_quantity",
      label: "Discount from quantity",
      help: "Discounts are only allowed for orders of at least this many units.",
      unit: "count",
    },
  ],
};

const toInput = (field: Field, value: number) =>
  field.unit === "money" ? (value / 100).toFixed(2) : String(value);
const fromInput = (field: Field, value: string) =>
  field.unit === "money" ? Math.round(Number(value) * 100) : Number(value);
const show = (field: Field, value: number) =>
  field.unit === "money"
    ? money(value)
    : field.unit === "percent"
      ? `${value}%`
      : String(value);

/** Owner-only private rules: the limits the server enforces on every agent offer. */
export function RulesView({ me, products }: { me: Me; products: Product[] }) {
  const role = me.workspace.role;
  const fields = FIELDS[role];
  const editable = can(me, "policies:write");
  const own = products.filter((p) => p.workspace_id === me.workspace.id);
  const [target, setTarget] = useState("workspace");
  const [rules, setRules] = useState<Rules | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function apply(loaded: Rules) {
    const values = loaded.rules as Record<string, number>;
    setRules(loaded);
    setForm(
      Object.fromEntries(
        fields.map((f) => [f.key, toInput(f, values[f.key] ?? 0)]),
      ),
    );
  }
  useEffect(() => {
    let current = true; // ignore a slow response for a previously selected target
    setRules(null);
    setError("");
    setNotice("");
    api
      .rules(target === "workspace" ? undefined : target)
      .then((loaded) => current && apply(loaded))
      .catch((cause) => current && setError((cause as Error).message));
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!rules) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = Object.fromEntries(
        fields.map((f) => [f.key, fromInput(f, form[f.key] ?? "")]),
      ) as RulesInput;
      const saved = await api.setRules(
        body,
        rules.version,
        target === "workspace" ? undefined : target,
      );
      if (!alive.current) return;
      apply(saved);
      setNotice(
        `Saved as version ${saved.version}. Open offers that relied on the old rules now need a new offer and fresh approvals.`,
      );
    } catch (cause) {
      if (alive.current) setError((cause as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const effective = rules?.effective as Record<string, number> | undefined;
  return (
    <section className="panel rules-panel">
      <div className="rules-intro">
        <Lock size={20} />
        <p>
          These limits are private to {me.workspace.name}. The server checks
          every agent offer against them; agents can read but never change them.
        </p>
      </div>
      {role === "seller" && (
        <label className="rules-target">
          Applies to
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="workspace">All products (workspace default)</option>
            {own.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} only
              </option>
            ))}
          </select>
          {target !== "workspace" && (
            <small>Product rules may only be stricter than the default.</small>
          )}
        </label>
      )}
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {rules ? (
        <form onSubmit={save} className="rules-form">
          {fields.map((f) => (
            <label key={f.key}>
              <span>{f.label}</span>
              <input
                type="number"
                inputMode="decimal"
                min={f.unit === "money" ? 0.01 : f.unit === "count" ? 1 : 0}
                max={f.unit === "percent" ? 100 : undefined}
                step={f.unit === "money" ? 0.01 : 1}
                value={form[f.key] ?? ""}
                disabled={!editable || busy}
                onChange={(e) =>
                  setForm((current) => ({
                    ...current,
                    [f.key]: e.target.value,
                  }))
                }
                required
              />
              <small>
                {f.help}
                {effective && target !== "workspace"
                  ? ` In effect now: ${show(f, effective[f.key] ?? 0)}.`
                  : ""}
              </small>
            </label>
          ))}
          <div className="rules-footer">
            <span className="muted">Version {rules.version}</span>
            {editable ? (
              <button className="button primary" disabled={busy}>
                <Save size={16} />
                {busy ? "Saving…" : "Save rules"}
              </button>
            ) : (
              <span className="muted">
                Only workspace owners can change rules.
              </span>
            )}
          </div>
        </form>
      ) : (
        !error && <p className="muted">Loading rules…</p>
      )}
    </section>
  );
}
