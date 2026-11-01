import { describe, expect, it } from "vitest";
import { activeFeatures, FEATURES, MODEL_CATALOG } from "@/lib/models";

describe("available studio capabilities", () => {
  it("drops removed tools from old plan and trial settings", () => {
    expect(activeFeatures(["invent", "edit", "vectorize", "compose", "variation"])).toEqual([
      "edit",
      "compose",
      "variation",
    ]);
  });
  it("advertises only the remaining tasks in features and model capabilities", () => {
    expect(FEATURES.map((feature) => feature.id)).toEqual(["edit", "compose", "variation"]);
    for (const model of MODEL_CATALOG)
      expect(model.tasks).toEqual(["edit", "compose", "variation"]);
  });
});
