import { describe, expect, it } from "vitest";
import { diversify, type PartyFeatures, scoreParty } from "../../src/modules/recommend/parties.js";

/** A party nobody has a reason to care about: 3 km away, next week, two going. */
const party = (over: Partial<PartyFeatures> = {}): PartyFeatures => ({
  id: "p",
  organiser_id: "host",
  interest_id: 1,
  interest_name: "Music",
  distance_m: 3000,
  starts_in_h: 24 * 5,
  going: 2,
  interested: 0,
  friends_going: 0,
  interest_affinity: 0,
  host_affinity: 0,
  follows_host: false,
  my_rsvp: null,
  impressions: 0,
  engaged: false,
  ...over,
});

describe("scoreParty", () => {
  it("puts a party of a kind I love, further away, above one next door I don't care about", () => {
    const loved = scoreParty(party({ distance_m: 8000, interest_affinity: 1 }));
    const nextDoor = scoreParty(party({ distance_m: 100, interest_affinity: 0 }));
    expect(loved.score).toBeGreaterThan(nextDoor.score);
  });

  it("puts a kind I keep skipping below an unknown one", () => {
    const disliked = scoreParty(party({ interest_affinity: -1 }));
    expect(disliked.score).toBeLessThan(scoreParty(party()).score);
  });

  it("counts friends going, up to three", () => {
    const one = scoreParty(party({ friends_going: 1 })).parts.friends;
    const three = scoreParty(party({ friends_going: 3 })).parts.friends;
    const ten = scoreParty(party({ friends_going: 10 })).parts.friends;
    expect(one).toBeGreaterThan(0);
    expect(three).toBeGreaterThan(one);
    expect(ten).toBe(three);
  });

  it("halves parties I already RSVP'd to and lowers ones I keep scrolling past", () => {
    const base = scoreParty(party()).score;
    expect(scoreParty(party({ my_rsvp: "going" })).score).toBeCloseTo(base * 0.5);
    expect(scoreParty(party({ impressions: 3 })).score).toBeCloseTo(base * 0.6);
    expect(scoreParty(party({ impressions: 3, engaged: true })).score).toBeCloseTo(base);
  });

  it("counts a party that's on now as fully soon", () => {
    expect(scoreParty(party({ starts_in_h: -1 })).parts.soon).toBe(1);
  });
});

describe("reason", () => {
  it("names friends when they are the strongest signal", () => {
    expect(scoreParty(party({ friends_going: 2 })).reason).toEqual({
      kind: "friends_going",
      text: "2 people you follow are going",
    });
  });

  it("names the kind of party I like", () => {
    expect(scoreParty(party({ interest_affinity: 0.9 })).reason).toEqual({
      kind: "interest",
      text: "Because you like Music",
    });
  });

  it("only gives a reason that's true to say", () => {
    expect(scoreParty(party({ interest_affinity: 0.1 })).reason).toBeNull();
    expect(scoreParty(party({ distance_m: 800 })).reason?.kind).toBe("nearby");
    expect(scoreParty(party({ follows_host: true, host_affinity: 0.5 })).reason?.kind).toBe("following_host");
    expect(scoreParty(party({ host_affinity: 0.5 })).reason?.text).toBe("From a host you've liked");
    expect(scoreParty(party({ starts_in_h: -0.5 })).reason?.text).toBe("On right now");
  });
});

describe("diversify by key", () => {
  it("breaks up runs of one kind without dropping anything", () => {
    const items = [1, 1, 1, 1, 2].map((kind, i) => ({ i, kind }));
    expect(diversify(items, (x) => x.kind, 3).map((x) => x.kind)).toEqual([1, 1, 1, 2, 1]);
  });

  it("doesn't treat a missing key as a run", () => {
    const items = [null, null, null, 2].map((kind, i) => ({ i, kind }));
    expect(diversify(items, (x) => x.kind, 2).map((x) => x.i)).toEqual([0, 1, 2, 3]);
  });
});
