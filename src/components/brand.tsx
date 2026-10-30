import { useQuery } from "@tanstack/react-query";
import { getPublicBranding } from "@/functions/account.functions";

export function useBranding() {
  return useQuery({
    queryKey: ["branding"],
    queryFn: () => getPublicBranding(),
    staleTime: 60_000,
  });
}

export function BrandMark({
  collapsed = false,
  inverted = false,
}: {
  collapsed?: boolean;
  inverted?: boolean;
}) {
  const { data } = useBranding();
  const name = data?.display_name ?? "Vupe Studio";
  return (
    <div className="flex items-center gap-2.5">
      {data?.logo_url ? (
        <img src={data.logo_url} alt={name} className="size-9 rounded-xl object-contain" />
      ) : (
        <div className="flex size-9 items-center justify-center rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-sm">
          V
        </div>
      )}
      {!collapsed && (
        <span
          className={`whitespace-nowrap font-display text-lg font-bold tracking-tight ${inverted ? "text-sidebar-foreground" : ""}`}
        >
          {name}
        </span>
      )}
    </div>
  );
}
