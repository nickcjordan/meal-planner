"use client";

import { usePathname } from "next/navigation";
import { AssistantFAB } from "./AssistantFAB";

export function AssistantProvider() {
  const pathname = usePathname();
  return <AssistantFAB pathname={pathname} />;
}
