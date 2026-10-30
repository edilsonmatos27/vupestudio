import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Workbench } from "@/components/workbench";

export const Route = createFileRoute("/_authenticated/criar")({
  validateSearch: (s) =>
    z.object({ agente: z.string().uuid().optional(), source: z.string().uuid().optional(), modo: z.enum(["edit", "compose", "variation"]).optional() }).parse(s),
  head: () => ({ meta: [{ title: "Criar imagem — Vupe Studio" }, { name: "description", content: "Edite, componha e gere variações de imagens." }] }),
  component: () => {
    const { agente, source, modo } = Route.useSearch();
    return <Workbench key={`${source ?? ""}-${modo ?? ""}`} mode="create" agentId={agente} sourceAssetId={source} initialTask={modo} />;
  },
});
