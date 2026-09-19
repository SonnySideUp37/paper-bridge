import { expect, test } from "bun:test";
import { urgencyOf } from "./api";

const today = new Date(2026, 8, 19); // Sep 19 2026

test("urgencyOf boundaries", () => {
  expect(urgencyOf(null, today)).toBe("none");
  expect(urgencyOf("2026-09-18", today)).toBe("overdue");
  expect(urgencyOf("2026-09-19", today)).toBe("this_week");
  expect(urgencyOf("2026-09-26", today)).toBe("this_week");
  expect(urgencyOf("2026-09-27", today)).toBe("later");
});
