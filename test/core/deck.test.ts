import { describe, it, expect } from 'vitest';
import { buildDeck, shuffle, deal } from '../../src/core/deck.js';

describe('buildDeck', () => {
  it('returns exactly 54 cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(54);
  });

  it('has no duplicate IDs', () => {
    const deck = buildDeck();
    const ids = deck.map(c => c.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(54);
  });

  it('has exactly 2 jokers', () => {
    const deck = buildDeck();
    const jokers = deck.filter(c => c.rank === 'joker');
    expect(jokers).toHaveLength(2);
  });

  it('has exactly 4 of each non-joker rank (one per suit)', () => {
    const deck = buildDeck();
    const nonJokers = deck.filter(c => c.rank !== 'joker');
    const rankCounts: Record<string, number> = {};
    for (const card of nonJokers) {
      rankCounts[card.rank] = (rankCounts[card.rank] ?? 0) + 1;
    }
    const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    for (const rank of RANKS) {
      expect(rankCounts[rank], `rank ${rank} should appear 4 times`).toBe(4);
    }
    // Exactly 13 distinct non-joker ranks
    expect(Object.keys(rankCounts)).toHaveLength(13);
  });

  it('joker cards have null suit', () => {
    const deck = buildDeck();
    const jokers = deck.filter(c => c.rank === 'joker');
    for (const joker of jokers) {
      expect(joker.suit).toBeNull();
    }
  });

  it('all non-joker cards have a non-null suit', () => {
    const deck = buildDeck();
    const nonJokers = deck.filter(c => c.rank !== 'joker');
    for (const card of nonJokers) {
      expect(card.suit).not.toBeNull();
    }
  });
});

describe('shuffle', () => {
  it('returns a new array (does not mutate the input)', () => {
    const deck = buildDeck();
    const original = [...deck];
    const shuffled = shuffle(deck);
    expect(shuffled).not.toBe(deck);
    // original deck array is untouched
    expect(deck).toEqual(original);
  });

  it('returns an array with the same cards', () => {
    const deck = buildDeck();
    const shuffled = shuffle(deck);
    expect(shuffled).toHaveLength(deck.length);
    const originalIds = new Set(deck.map(c => c.id));
    const shuffledIds = new Set(shuffled.map(c => c.id));
    expect(shuffledIds).toEqual(originalIds);
  });

  it('produces a different order with high probability', () => {
    // With 54 cards the probability of the same order is astronomically small (1/54!)
    const deck = buildDeck();
    const shuffled = shuffle(deck);
    const sameOrder = deck.every((card, i) => card.id === shuffled[i]?.id);
    expect(sameOrder).toBe(false);
  });

  it('shuffling twice produces different results with high probability', () => {
    const deck = buildDeck();
    const s1 = shuffle(deck);
    const s2 = shuffle(deck);
    const sameOrder = s1.every((card, i) => card.id === s2[i]?.id);
    expect(sameOrder).toBe(false);
  });
});

describe('deal', () => {
  it('deals 54 cards to 2 players: 27 cards each', () => {
    const deck = buildDeck();
    const hands = deal(deck, 2);
    expect(hands).toHaveLength(2);
    expect(hands[0]).toHaveLength(27);
    expect(hands[1]).toHaveLength(27);
  });

  it('deals 54 cards to 3 players: 18 cards each', () => {
    const deck = buildDeck();
    const hands = deal(deck, 3);
    expect(hands).toHaveLength(3);
    for (const hand of hands) {
      expect(hand).toHaveLength(18);
    }
  });

  it('deals 54 cards to 5 players: max hand-size difference is 1', () => {
    const deck = buildDeck();
    const hands = deal(deck, 5);
    expect(hands).toHaveLength(5);
    const sizes = hands.map(h => h.length);
    const min = Math.min(...sizes);
    const max = Math.max(...sizes);
    expect(max - min).toBeLessThanOrEqual(1);
    // 54 / 5 = 10 remainder 4, so 4 players get 11 and 1 player gets 10
    expect(sizes.filter(s => s === 11)).toHaveLength(4);
    expect(sizes.filter(s => s === 10)).toHaveLength(1);
  });

  it('deals 54 cards to 6 players: max hand-size difference is 0 (exactly 9 each)', () => {
    const deck = buildDeck();
    const hands = deal(deck, 6);
    expect(hands).toHaveLength(6);
    for (const hand of hands) {
      expect(hand).toHaveLength(9);
    }
  });

  it('throws with fewer than 2 players', () => {
    const deck = buildDeck();
    expect(() => deal(deck, 1)).toThrow();
    expect(() => deal(deck, 0)).toThrow();
  });

  it('throws with more than 6 players', () => {
    const deck = buildDeck();
    expect(() => deal(deck, 7)).toThrow();
  });

  it('distributes all 54 cards — no card lost or duplicated', () => {
    const deck = buildDeck();
    const hands = deal(deck, 4);
    const allDealtIds = hands.flatMap(h => h.map(c => c.id));
    // Same total count
    expect(allDealtIds).toHaveLength(54);
    // Same set of IDs — no duplicates, no missing cards
    expect(new Set(allDealtIds)).toEqual(new Set(deck.map(c => c.id)));
  });

  it('distributes all cards correctly for 4 players too', () => {
    const deck = buildDeck();
    const hands = deal(deck, 4);
    // 54 / 4 = 13 remainder 2: two players get 14, two players get 13
    const sizes = hands.map(h => h.length);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(54);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });
});
