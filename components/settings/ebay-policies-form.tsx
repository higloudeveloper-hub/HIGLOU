"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_VALUES } from "@/config/default-values";
import { Loader2, Download, PlusCircle } from "lucide-react";

type Policies = {
  paymentPolicyId: string;
  returnPolicyId: string;
  shippingPolicyId: string;
  defaultItemLocation: string;
  defaultPostalCode: string;
  defaultHandlingTime: number;
};

type PolicyOption = { id: string; name: string };

type Available = {
  fulfillment: PolicyOption[];
  payment: PolicyOption[];
  return: PolicyOption[];
};

const emptyPolicies: Policies = {
  paymentPolicyId: "",
  returnPolicyId: "",
  shippingPolicyId: "",
  defaultItemLocation: DEFAULT_VALUES.itemLocation,
  defaultPostalCode: "",
  defaultHandlingTime: DEFAULT_VALUES.handlingTime,
};

function PolicySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: PolicyOption[];
  onChange: (id: string) => void;
}) {
  if (!options.length) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a policy…</option>
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.name} ({opt.id})
          </option>
        ))}
      </select>
      {!options.some((o) => o.id === value) && value ? (
        <Input
          className="mt-1"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Custom policy ID"
        />
      ) : null}
    </div>
  );
}

export function EbayPoliciesForm() {
  const [policies, setPolicies] = useState<Policies>(emptyPolicies);
  const [available, setAvailable] = useState<Available | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/settings/policies");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error || "Failed to load policies");
        }
        const data = (await res.json()) as { policies: Policies };
        setPolicies(data.policies);
      } catch (error) {
        toast.message("Using empty policy defaults", {
          description:
            error instanceof Error ? error.message : "Could not load policies",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/policies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policies),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || "Save failed");
      }
      const data = (await res.json()) as { policies: Policies };
      setPolicies(data.policies);
      toast.success("eBay policies saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const importFromEbay = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/ebay/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ create: true }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        policies?: Policies;
        available?: Available;
        created?: string[];
      } | null;
      if (!res.ok) throw new Error(body?.error || "Import failed");
      if (body?.policies) setPolicies(body.policies);
      if (body?.available) setAvailable(body.available);
      const created = body?.created?.length
        ? ` Created: ${body.created.join(", ")}.`
        : "";
      toast.success(
        `Synced business policies from this eBay account.${created}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const createHiglouPolicies = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/ebay/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          create: true,
          recreateFulfillment: true,
          recreateReturn: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        policies?: Policies;
        available?: Available;
        created?: string[];
      } | null;
      if (!res.ok) throw new Error(body?.error || "Create failed");
      if (body?.policies) setPolicies(body.policies);
      if (body?.available) setAvailable(body.available);
      toast.success(
        "Updated Higlou policies: Ground Advantage (buyer pays) + 14-day returns",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading policies…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5 text-[12px] text-emerald-900">
        Policies belong to each eBay seller account — they cannot be copied by
        ID. Import syncs this connected account, or Create Higlou policies makes
        calculated shipping via USPS Ground Advantage (cheapest; buyer pays
        full flat rate), payment, and 14-day returns (buyer pays return ship).
        Required for draft and live publish.
      </div>

      <PolicySelect
        label="Shipping policy"
        value={policies.shippingPolicyId}
        options={available?.fulfillment || []}
        onChange={(shippingPolicyId) =>
          setPolicies((prev) => ({ ...prev, shippingPolicyId }))
        }
      />
      <PolicySelect
        label="Return policy"
        value={policies.returnPolicyId}
        options={available?.return || []}
        onChange={(returnPolicyId) =>
          setPolicies((prev) => ({ ...prev, returnPolicyId }))
        }
      />
      <PolicySelect
        label="Payment policy"
        value={policies.paymentPolicyId}
        options={available?.payment || []}
        onChange={(paymentPolicyId) =>
          setPolicies((prev) => ({ ...prev, paymentPolicyId }))
        }
      />

      <div className="space-y-2">
        <Label>Default item location</Label>
        <Input
          value={policies.defaultItemLocation}
          onChange={(e) =>
            setPolicies((prev) => ({
              ...prev,
              defaultItemLocation: e.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Default postal code</Label>
        <Input
          value={policies.defaultPostalCode}
          onChange={(e) =>
            setPolicies((prev) => ({
              ...prev,
              defaultPostalCode: e.target.value,
            }))
          }
        />
      </div>
      <div className="space-y-2">
        <Label>Default handling time</Label>
        <Input
          type="number"
          min={0}
          value={policies.defaultHandlingTime}
          onChange={(e) =>
            setPolicies((prev) => ({
              ...prev,
              defaultHandlingTime: Number(e.target.value),
            }))
          }
        />
      </div>
      <p className="text-xs text-zinc-500">
        After connecting a new eBay account, use Create Higlou policies once.
        Publish also auto-creates missing policies for the connected seller.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={importing || saving || creating}
          onClick={() => void importFromEbay()}
        >
          {importing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          {importing ? "Importing…" : "Import from eBay"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={creating || saving || importing}
          onClick={() => void createHiglouPolicies()}
          title="Create shipping, payment, and return policies on the connected eBay account"
        >
          {creating ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlusCircle className="size-4" />
          )}
          {creating ? "Creating…" : "Create Higlou policies"}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || importing || creating}
          title={saving ? "Saving policies…" : "Save eBay business policy IDs"}
        >
          {saving ? "Saving…" : "Save policies"}
        </Button>
      </div>
    </div>
  );
}
