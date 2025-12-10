"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface ViewToggleProps {
  basePath: string;
}

export function ViewToggle({ basePath }: ViewToggleProps) {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "cards";
  const isListView = currentView === "list";

  const buildViewHref = (mode: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", mode);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">View:</span>
      <Link
        href={buildViewHref("cards")}
        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
          !isListView
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background border-muted-foreground/40 text-foreground hover:bg-muted"
        }`}
      >
        Cards
      </Link>
      <Link
        href={buildViewHref("list")}
        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
          isListView
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background border-muted-foreground/40 text-foreground hover:bg-muted"
        }`}
      >
        List
      </Link>
    </div>
  );
}

