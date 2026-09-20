"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { CreditSpendConfirm } from "@/components/credits/credit-spend-confirm";
import { ProUnlockModal } from "@/components/credits/pro-unlock-modal";
import type { CreditActionId } from "@/lib/credits/costs";
import {
  hasProAccess,
  type ProFeatureId,
} from "@/lib/credits/pro";

type WalletSnap = {
  balance: number;
  ready: boolean;
};

type Entitlements = {
  plan: "free" | "pro";
  unlockedFeatures: string[];
};

type ConfirmRequest = {
  action: CreditActionId;
  detail?: string;
  resolve: (ok: boolean) => void;
};

type ProRequest = {
  featureId: ProFeatureId;
  resolve: (ok: boolean) => void;
};

type PaidActionContextValue = {
  balance: number;
  entitlements: Entitlements;
  refresh: () => Promise<void>;
  confirmSpend: (
    action: CreditActionId,
    detail?: string,
  ) => Promise<boolean>;
  requirePro: (featureId: ProFeatureId) => Promise<boolean>;
};

const PaidActionContext = createContext<PaidActionContextValue | null>(null);

export function PaidActionProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletSnap>({ balance: 0, ready: false });
  const [entitlements, setEntitlements] = useState<Entitlements>({
    plan: "free",
    unlockedFeatures: [],
  });
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [proReq, setProReq] = useState<ProRequest | null>(null);
  const [busyPro, setBusyPro] = useState<"feature" | "pro" | null>(null);

  const applyCreditsPayload = useCallback(
    (body: {
      wallet?: { balance?: number; ready?: boolean };
      entitlements?: Entitlements;
    }) => {
      setWallet({
        balance: Number(body.wallet?.balance) || 0,
        ready: Boolean(body.wallet?.ready ?? true),
      });
      if (body.entitlements) {
        setEntitlements({
          plan: body.entitlements.plan === "pro" ? "pro" : "free",
          unlockedFeatures: body.entitlements.unlockedFeatures || [],
        });
      }
    },
    [],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/credits", { cache: "no-store" });
      if (!res.ok) return;
      applyCreditsPayload(await res.json());
    } catch {
      /* ignore */
    }
  }, [applyCreditsPayload]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const confirmSpend = useCallback(
    async (action: CreditActionId, detail?: string) => {
      await refresh();
      return new Promise<boolean>((resolve) => {
        setConfirm({ action, detail, resolve });
      });
    },
    [refresh],
  );

  const requirePro = useCallback(
    async (featureId: ProFeatureId) => {
      try {
        const res = await fetch("/api/credits", { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as {
            wallet?: { balance?: number; ready?: boolean };
            entitlements?: Entitlements;
          };
          applyCreditsPayload(body);
          const next: Entitlements = {
            plan: body.entitlements?.plan === "pro" ? "pro" : "free",
            unlockedFeatures: body.entitlements?.unlockedFeatures || [],
          };
          if (hasProAccess(next, featureId)) return true;
        }
      } catch {
        /* show modal */
      }
      return new Promise<boolean>((resolve) => {
        setProReq({ featureId, resolve });
      });
    },
    [applyCreditsPayload],
  );

  const value = useMemo<PaidActionContextValue>(
    () => ({
      balance: wallet.balance,
      entitlements,
      refresh,
      confirmSpend,
      requirePro,
    }),
    [wallet.balance, entitlements, refresh, confirmSpend, requirePro],
  );

  return (
    <PaidActionContext.Provider value={value}>
      {children}
      <CreditSpendConfirm
        open={Boolean(confirm)}
        action={confirm?.action || "winners_scan"}
        balance={wallet.balance}
        detail={confirm?.detail}
        onCancel={() => {
          confirm?.resolve(false);
          setConfirm(null);
        }}
        onConfirm={() => {
          confirm?.resolve(true);
          setConfirm(null);
        }}
      />
      <ProUnlockModal
        open={Boolean(proReq)}
        featureId={proReq?.featureId || "facebook_carousel"}
        balance={wallet.balance}
        busy={busyPro}
        onCancel={() => {
          proReq?.resolve(false);
          setProReq(null);
        }}
        onUnlockFeature={async () => {
          if (!proReq) return;
          setBusyPro("feature");
          try {
            const res = await fetch("/api/credits", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                intent: "unlock_feature",
                featureId: proReq.featureId,
              }),
            });
            const body = (await res.json()) as {
              error?: string;
              entitlements?: Entitlements;
              wallet?: { balance?: number; ready?: boolean };
            };
            if (!res.ok) {
              toast.error(body.error || "No se pudo desbloquear");
              if (res.status === 402) window.location.href = "/credits";
              return;
            }
            applyCreditsPayload(body);
            toast.success("Desbloqueado · listo para usar");
            proReq.resolve(true);
            setProReq(null);
          } finally {
            setBusyPro(null);
          }
        }}
        onUnlockPro={async () => {
          if (!proReq) return;
          setBusyPro("pro");
          try {
            const res = await fetch("/api/credits", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ intent: "unlock_pro" }),
            });
            const body = (await res.json()) as {
              error?: string;
              entitlements?: Entitlements;
              wallet?: { balance?: number; ready?: boolean };
            };
            if (!res.ok) {
              toast.error(body.error || "No se pudo activar Pro");
              if (res.status === 402) window.location.href = "/credits";
              return;
            }
            applyCreditsPayload({
              ...body,
              entitlements: body.entitlements || {
                plan: "pro",
                unlockedFeatures: [],
              },
            });
            toast.success("Plan Pro activo");
            proReq.resolve(true);
            setProReq(null);
          } finally {
            setBusyPro(null);
          }
        }}
      />
    </PaidActionContext.Provider>
  );
}

export function usePaidAction() {
  const ctx = useContext(PaidActionContext);
  if (!ctx) {
    throw new Error("usePaidAction must be used within PaidActionProvider");
  }
  return ctx;
}

export function usePaidActionOptional(): PaidActionContextValue {
  const ctx = useContext(PaidActionContext);
  return (
    ctx || {
      balance: 0,
      entitlements: { plan: "free", unlockedFeatures: [] },
      refresh: async () => {},
      confirmSpend: async () => true,
      requirePro: async () => true,
    }
  );
}
