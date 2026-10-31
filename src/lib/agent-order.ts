/** Explicit positions come first; agents without a position keep alphabetical order. */
export function agentDisplayOrder(settings: unknown): number | null {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return null;
  const position = (settings as Record<string, unknown>)["display_order"];
  return typeof position === "number" &&
    Number.isInteger(position) &&
    position >= 1 &&
    position <= 1_000_000
    ? position
    : null;
}

export function sortAgentsForDisplay<T extends { id: string; name: string; settings: unknown }>(
  agents: readonly T[],
): T[] {
  return [...agents].sort((a, b) => {
    const first = agentDisplayOrder(a.settings);
    const second = agentDisplayOrder(b.settings);
    if (first !== second) {
      if (first === null) return 1;
      if (second === null) return -1;
      return first - second;
    }
    return a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id);
  });
}
