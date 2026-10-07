import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isReflectionImageFile, pickNextImage, reflectionImageUrl } from "./reflection-images.ts";

const day = (n: number) => new Date(Date.UTC(2026, 0, n));
const used = (entries: Record<string, number>) => new Map(Object.entries(entries).map(([file, d]) => [file, day(d)]));

describe("isReflectionImageFile", () => {
  it("accepts jpg/jpeg/png/webp in any case and rejects everything else", () => {
    for (const ok of ["a.jpg", "b.JPEG", "c.png", "d.webp", "e.avif", "F.AVIF", "photo-1490730141103-6cac27aaab94.avif", "My Sky.JPG"]) assert.equal(isReflectionImageFile(ok), true, ok);
    for (const bad of ["README.md", "notes.txt", "clip.gif", ".gitkeep", ".DS_Store", ".hidden.jpg", "noextension", "photo.jpg.bak"]) {
      assert.equal(isReflectionImageFile(bad), false, bad);
    }
  });
});

describe("pickNextImage", () => {
  it("returns null when there are no images", () => {
    assert.equal(pickNextImage([], new Map()), null);
    assert.equal(pickNextImage(["README.md", ".gitkeep"], new Map()), null);
  });

  it("prefers a never-used image over any used one", () => {
    assert.equal(pickNextImage(["a.jpg", "b.jpg"], used({ "a.jpg": 5 })), "b.jpg");
  });

  it("among never-used images picks by file name, deterministically", () => {
    assert.equal(pickNextImage(["c.jpg", "a.jpg", "b.jpg"], new Map()), "a.jpg");
    assert.equal(pickNextImage(["b.jpg", "c.jpg", "a.jpg"], new Map()), "a.jpg");
  });

  it("picks the least recently used when all have been used", () => {
    assert.equal(pickNextImage(["a.jpg", "b.jpg", "c.jpg"], used({ "a.jpg": 9, "b.jpg": 3, "c.jpg": 6 })), "b.jpg");
  });

  it("ignores non-image files and history for files that no longer exist", () => {
    assert.equal(pickNextImage(["README.md", "only.png"], used({ "deleted.jpg": 1, "only.png": 4 })), "only.png");
  });

  it("walks every image once, then starts a new cycle", () => {
    const files = ["a.jpg", "b.jpg", "c.jpg"];
    const history = new Map<string, Date>();
    const order: string[] = [];
    for (let week = 0; week < 6; week++) {
      const next = pickNextImage(files, history)!;
      order.push(next);
      history.set(next, day(10 + week));
    }
    assert.deepEqual(order, ["a.jpg", "b.jpg", "c.jpg", "a.jpg", "b.jpg", "c.jpg"]);
  });

  it("uses a newly added image next, without waiting for the cycle to finish", () => {
    assert.equal(pickNextImage(["a.jpg", "b.jpg", "new.jpg"], used({ "a.jpg": 10, "b.jpg": 11 })), "new.jpg");
  });
});

describe("reflectionImageUrl", () => {
  it("builds a servable, encoded URL", () => {
    assert.equal(reflectionImageUrl("sky.jpg"), "/images/weeklyreflection/sky.jpg");
    assert.equal(reflectionImageUrl("my sky #1.jpg"), "/images/weeklyreflection/my%20sky%20%231.jpg");
  });
});
