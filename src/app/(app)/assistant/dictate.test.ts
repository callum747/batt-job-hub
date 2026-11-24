import { describe, expect, it } from "vitest";
import { joinSpoken } from "./dictate";

describe("adding spoken words to the message box", () => {
  it("starts a message with a capital, and joins later phrases with one space", () => {
    expect(joinSpoken("", "  price the oaken grove job ")).toBe("Price the oaken grove job");
    expect(joinSpoken("Price the Oaken Grove job ", " one day for two")).toBe("Price the Oaken Grove job one day for two");
    expect(joinSpoken("Typed.", "")).toBe("Typed.");
  });
});
