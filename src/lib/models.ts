// Verified catalog of image models reachable through the managed Lovable AI integration.
// Capabilities were checked against the authenticated model listing (/v1/models) and the
// documented request contracts. Only safe metadata lives here (shared with the browser).

export type Task = "invent" | "edit" | "compose" | "variation";
export type Feature = Task | "vectorize";
export type RequestFormat = "openai" | "gemini-chat" | "generate-content";

export interface ModelInfo {
  id: string;
  family: string;
  label: string;
  version: string;
  format: RequestFormat;
  tasks: Task[];
  aspects: string[]; // empty = model decides
  qualities: string[]; // empty = not configurable
  transparency: boolean;
  maxInputImages: number;
  note?: string;
}

export const FEATURES: { id: Feature; label: string }[] = [
  { id: "invent", label: "Inventar imagem" },
  { id: "edit", label: "Editar imagem" },
  { id: "compose", label: "Composição" },
  { id: "variation", label: "Variações" },
  { id: "vectorize", label: "Vetorização" },
];

export const TASK_LABEL: Record<string, string> = {
  invent: "Criação",
  edit: "Edição",
  compose: "Composição",
  variation: "Variação",
  vectorize: "Vetorização",
  logo_overlay: "Logomarca aplicada",
};

const ALL_TASKS: Task[] = ["invent", "edit", "compose", "variation"];

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "openai/gpt-image-2.5-sunburst",
    family: "OpenAI · GPT Image 2.5",
    label: "GPT Image 2.5 Sunburst",
    version: "2.5-sunburst",
    format: "openai",
    tasks: ALL_TASKS,
    aspects: ["1:1", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
    transparency: true,
    maxInputImages: 10,
    note: "Prioriza qualidade.",
  },
  {
    id: "openai/gpt-image-2.5-flare",
    family: "OpenAI · GPT Image 2.5",
    label: "GPT Image 2.5 Flare",
    version: "2.5-flare",
    format: "openai",
    tasks: ALL_TASKS,
    aspects: ["1:1", "3:2", "2:3"],
    qualities: ["low", "medium", "high"],
    transparency: true,
    maxInputImages: 10,
    note: "Prioriza velocidade.",
  },
  {
    id: "openai/gpt-image-2",
    family: "OpenAI · GPT Image 2",
    label: "GPT Image 2",
    version: "2",
    format: "openai",
    tasks: ALL_TASKS,
    aspects: ["1:1", "3:2", "2:3"],
    qualities: [],
    transparency: false,
    maxInputImages: 10,
    note: "Não gera fundo transparente.",
  },
  {
    id: "google/gemini-3-pro-image",
    family: "Google · Gemini 3 Pro Image",
    label: "Gemini 3 Pro Image",
    version: "3-pro-image",
    format: "gemini-chat",
    tasks: ALL_TASKS,
    aspects: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    qualities: [],
    transparency: false,
    maxInputImages: 10,
  },
  {
    id: "google/gemini-3.1-flash-image",
    family: "Google · Gemini 3.1 Flash Image",
    label: "Gemini 3.1 Flash Image",
    version: "3.1-flash-image",
    format: "gemini-chat",
    tasks: ALL_TASKS,
    aspects: [
      "1:1",
      "2:3",
      "3:2",
      "3:4",
      "4:3",
      "4:5",
      "5:4",
      "9:16",
      "16:9",
      "21:9",
      "1:4",
      "4:1",
    ],
    qualities: [],
    transparency: false,
    maxInputImages: 10,
  },
  {
    id: "google/gemini-3.1-flash-lite-image",
    family: "Google · Gemini 3.1 Flash Lite Image",
    label: "Gemini 3.1 Flash Lite Image",
    version: "3.1-flash-lite-image",
    format: "generate-content",
    tasks: ALL_TASKS,
    aspects: [],
    qualities: [],
    transparency: false,
    maxInputImages: 10,
    note: "Econômico. Proporção definida pelo modelo.",
  },
];

export function findModel(id: string | null | undefined) {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export const OPENAI_SIZE: Record<string, string> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "2:3": "1024x1536",
};

export const UPLOAD_LIMITS = {
  main: 3,
  style: 2,
  element: 4,
  logo: 1,
  maxBytes: 10 * 1024 * 1024,
  mimes: ["image/png", "image/jpeg", "image/webp"],
};

export const TRIAL_EXPIRED_MESSAGE =
  "Seu período de teste terminou. Escolha um plano e conclua o pagamento para continuar usando o Vupe Studio.";
export const NO_CREDITS_MESSAGE =
  "Seus créditos acabaram. Entre em contato com o administrador para solicitar novos créditos.";
