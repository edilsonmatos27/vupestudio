import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { History } from "lucide-react";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { OperationCard, type Op } from "@/components/operation-card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listHistory, studioOptions } from "@/server/studio.functions";
import { errorMessage } from "@/lib/client-api";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({ meta: [{ title: "Meu histórico — Vupe Studio" }, { name: "description", content: "Todas as suas criações, edições e vetorizações." }] }),
  component: HistoryPage,
});

const FILTERS = [
  ["all", "Tudo"], ["invent", "Criação"], ["edit", "Edição"], ["compose", "Composição"], ["variation", "Variação"], ["vectorize", "Vetorização"], ["logo_overlay", "Logomarca"],
] as const;

function HistoryPage() {
  const [type, setType] = useState<(typeof FILTERS)[number][0]>("all");
  const q = useQuery({
    queryKey: ["history", type],
    queryFn: () => listHistory({ data: { type, limit: 40 } }),
    refetchInterval: (query) => ((query.state.data as Op[] | undefined)?.some((o) => ["queued", "running"].includes(o.status)) ? 4000 : false),
  });
  const opts = useQuery({ queryKey: ["studio-options"], queryFn: () => studioOptions() });
  return (
    <div>
      <PageHeader title="Meu histórico" description="Status, modelo, agente, instruções e consumo de cada operação." />
      <Tabs value={type} onValueChange={(v) => setType(v as typeof type)} className="mb-5">
        <TabsList className="flex h-auto flex-wrap">
          {FILTERS.map(([v, l]) => <TabsTrigger key={v} value={v}>{l}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      {q.isLoading ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={<History className="size-5" />} title="Nada por aqui ainda" description="Suas operações aparecerão aqui assim que você criar algo." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {(q.data as Op[]).map((op) => <OperationCard key={op.id} op={op} projects={opts.data?.projects} />)}
        </div>
      )}
    </div>
  );
}
