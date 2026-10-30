import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Workbench } from "@/components/workbench";

export const Route = createFileRoute("/_authenticated/inventar")({
  validateSearch: (s) => z.object({ agente: z.string().uuid().optional() }).parse(s),
  head: () => ({
    meta: [
      { title: "Inventar imagem — Vupe Studio" },
      { name: "description", content: "Gere imagens do zero com IA." },
    ],
  }),
  component: InventPage,
});

function InventPage() {
  const { agente } = Route.useSearch();
  return <Workbench mode="invent" agentId={agente} />;
}
