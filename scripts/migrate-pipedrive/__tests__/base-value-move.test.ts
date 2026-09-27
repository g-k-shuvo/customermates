import { describe, expect, it } from "vitest";

import { planBaseValueMove } from "../base-value-move";

const VALUE_SERVICE = "value-service";

describe("planBaseValueMove", () => {
  it("moves the value line into baseValue, keeping totalValue and dropping its quantity", () => {
    expect(
      planBaseValueMove(
        {
          dealId: "d1",
          baseValue: 0,
          weight: 40,
          lines: [{ serviceId: VALUE_SERVICE, amount: 1, quantity: 2500 }],
        },
        VALUE_SERVICE,
      ),
    ).toEqual({
      dealId: "d1",
      moved: 2500,
      baseValue: 2500,
      totalValue: 2500,
      totalQuantity: 0,
      weightedValue: 1000,
    });
  });

  it("keeps the other service lines on top of the moved base", () => {
    expect(
      planBaseValueMove(
        {
          dealId: "d2",
          baseValue: 100,
          weight: undefined,
          lines: [
            { serviceId: VALUE_SERVICE, amount: 1, quantity: 900 },
            { serviceId: "consulting", amount: 150, quantity: 2 },
          ],
        },
        VALUE_SERVICE,
      ),
    ).toEqual({
      dealId: "d2",
      moved: 900,
      baseValue: 1000,
      totalValue: 1300,
      totalQuantity: 2,
      weightedValue: null,
    });
  });

  it("returns nothing for a deal without the value line, so a re-run skips converted deals", () => {
    expect(
      planBaseValueMove(
        {
          dealId: "d3",
          baseValue: 2500,
          weight: 50,
          lines: [{ serviceId: "consulting", amount: 150, quantity: 2 }],
        },
        VALUE_SERVICE,
      ),
    ).toBeNull();
  });
});
