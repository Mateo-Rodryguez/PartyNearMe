import { describe, expect, it } from "vitest";
import { diversify } from "../../src/modules/feed/ranking.js";

const posts = (authors: string) => [...authors].map((a, i) => ({ id: `${a}${i}`, author_id: a }));
const authors = (list: { author_id: string }[]) => list.map((p) => p.author_id).join("");

describe("diversify", () => {
  it("allows at most two in a row from one author", () => {
    expect(authors(diversify(posts("aaaabbc")))).toBe("aabaabc");
  });

  it("keeps the order when it's already varied", () => {
    expect(authors(diversify(posts("abcabc")))).toBe("abcabc");
  });

  it("keeps every post, leaving an unavoidable run at the end", () => {
    const out = diversify(posts("aaaaab"));
    expect(authors(out)).toBe("aabaaa");
    expect(out).toHaveLength(6);
  });

  it("moves the next-best post from someone else, not a random one", () => {
    const out = diversify(posts("aaabc"));
    expect(out.map((p) => p.id)).toEqual(["a0", "a1", "b3", "a2", "c4"]);
  });
});
