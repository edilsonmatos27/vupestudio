import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand";

export function AuthLayout({
  title,
  subtitle,
  children,
  wide,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background bg-hero">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6">
        <Link to="/" className="self-start">
          <BrandMark />
        </Link>
        <div className="flex flex-1 items-center justify-center py-10">
          <div
            className={`w-full ${wide ? "max-w-3xl" : "max-w-md"} rounded-3xl border bg-panel p-6 shadow-soft sm:p-8`}
          >
            <h1 className="text-2xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
