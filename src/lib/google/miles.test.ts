import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("miles from Google Maps", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GOOGLE_MAPS_API_KEY;
  });

  it("adds the way there and the way back, to the nearest mile, asking for driving routes in Great Britain", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "k";
    const asked: { origin: string; destination: string; key: string; mask: string; mode: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const b = JSON.parse(String(init.body));
      const h = init.headers as Record<string, string>;
      asked.push({ origin: b.origin.address, destination: b.destination.address, key: h["X-Goog-Api-Key"], mask: h["X-Goog-FieldMask"], mode: b.travelMode });
      // 244.6 km there, 245.3 km back
      return new Response(JSON.stringify({ routes: [{ distanceMeters: b.origin.address.startsWith("18 Alwin") ? 244600 : 245300 }] }), { status: 200 });
    }));
    const { roundTripMiles, jobAddress } = await import("./miles");
    const m = await roundTripMiles(jobAddress({ site: "Dean Retail Park, Hankridge Way, Taunton", postcode: "TA1 2LR" }));
    expect(m).toEqual({ roundTrip: 304, out: 152, back: 152.4, to: "Dean Retail Park, Hankridge Way, Taunton, TA1 2LR" });
    expect(asked).toHaveLength(2);
    expect(asked[0]).toMatchObject({ origin: "18 Alwin Close, Aylesbury, HP21 8RP", key: "k", mask: "routes.distanceMeters", mode: "DRIVE" });
    expect(asked[1].destination).toBe("18 Alwin Close, Aylesbury, HP21 8RP");
  });

  it("doesn't repeat a postcode that's already in the site line", async () => {
    const { jobAddress } = await import("./miles");
    expect(jobAddress({ site: "1 Finsbury Circus, London, EC2M 7EB", postcode: "ec2m 7eb" })).toBe("1 Finsbury Circus, London, EC2M 7EB");
    expect(jobAddress({ site: "", postcode: "HP20 2NQ" })).toBe("HP20 2NQ");
  });

  it("says plainly when there's no key, no route, or the key is refused", async () => {
    const { roundTripMiles } = await import("./miles");
    await expect(roundTripMiles("TA1 2LR")).rejects.toThrow("GOOGLE_MAPS_API_KEY is missing");
    process.env.GOOGLE_MAPS_API_KEY = "k";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
    await expect(roundTripMiles("Nowhere at all")).rejects.toThrow("couldn't find a driving route");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Routes API has not been used in project 1 before or it is disabled." } }), { status: 403 })));
    await expect(roundTripMiles("TA1 2LR")).rejects.toThrow("The Routes API isn't switched on");
  });
});

describe("why Google Maps turned the key down", () => {
  it("names the one setting to fix", async () => {
    const { keyFix } = await import("./miles");
    expect(keyFix("API_KEY_SERVICE_BLOCKED Requests to this API routes.googleapis.com method are blocked.")).toContain("API restrictions");
    expect(keyFix("API_KEY_HTTP_REFERRER_BLOCKED")).toContain("Application restrictions");
    expect(keyFix("BILLING_DISABLED")).toContain("billing account");
    expect(keyFix("API_KEY_INVALID API key not valid.")).toContain("Replit Secrets");
    expect(keyFix("something else")).toBe("");
  });
});
