import { describe, expect, it } from "vitest";
import { CliJobQueue } from "./cliJobQueue.js";

describe("CliJobQueue", () => {
  it("ジョブを直列実行する", async () => {
    const queue = new CliJobQueue();
    const order: number[] = [];

    const first = queue.enqueue(async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push(1);
    });
    const second = queue.enqueue(async () => {
      order.push(2);
    });

    await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
  });
});
