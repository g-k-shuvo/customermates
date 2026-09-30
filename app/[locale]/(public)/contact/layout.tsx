import { redirect } from "next/navigation";

import { env } from "@/env";

type Props = {
  children: React.ReactNode;
};

export default function SelfHostedHiddenLayout({ children }: Props) {
  if (env.APP_MODE === "self-hosted") redirect("/dashboard");

  return children;
}
