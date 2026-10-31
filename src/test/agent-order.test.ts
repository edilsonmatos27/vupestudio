import { describe, expect, it } from "vitest";
import { agentDisplayOrder, sortAgentsForDisplay } from "@/lib/agent-order";

const agent = (id: string, name: string, settings: unknown = {}) => ({ id, name, settings });

describe("agent card order", () => {
  it("uses numeric positions, then alphabetical ties, with unpositioned agents last", () => {
    const original = [
      agent("a", "Aquarela"),
      agent("b", "Zebra", { display_order: 10 }),
      agent("c", "Cyberpunk", { display_order: 2 }),
      agent("d", "Anime", { display_order: 2 }),
    ];
    expect(sortAgentsForDisplay(original).map((a) => a.id)).toEqual(["d", "c", "b", "a"]);
    expect(original.map((a) => a.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("keeps old agents alphabetical and ignores invalid legacy positions", () => {
    for (const settings of [
      null,
      [],
      { display_order: "2" },
      { display_order: -1 },
      { display_order: 1.5 },
    ])
      expect(agentDisplayOrder(settings)).toBeNull();
    expect(
      sortAgentsForDisplay([agent("b", "Zebra"), agent("a", "Anime")]).map((a) => a.id),
    ).toEqual(["a", "b"]);
  });
});
