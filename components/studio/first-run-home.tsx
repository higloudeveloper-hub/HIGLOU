"use client";

import { MoneyMachineHome } from "@/components/studio/money-machine-home";

export function FirstRunHome({
  name,
  setupItems,
}: {
  name: string | null;
  setupDoneCount: number;
  setupItems: {
    done: boolean;
    title: string;
    body: string;
    href: string;
  }[];
}) {
  const ebay = setupItems.find((i) => i.href.includes("ebay"));
  return (
    <MoneyMachineHome
      name={name}
      ebayConnected={Boolean(ebay?.done)}
      setupHref={ebay?.done ? null : "/settings#ebay-store"}
    />
  );
}
