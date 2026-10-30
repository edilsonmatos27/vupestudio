import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { LoadingState } from "@/components/states";

// UI convenience only: every admin server function re-checks the role on the server.
export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminGate,
});

function AdminGate() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <LoadingState />;
  if (!me?.isAdmin)
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-center">
        <ShieldAlert className="size-8 text-destructive" />
        <h1 className="text-xl font-bold">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">Esta área é exclusiva do admin master.</p>
      </div>
    );
  return <Outlet />;
}
