import { describe, it, expect } from 'vitest';
import {
  validatePlay,
  resolveBluff,
  checkWin,
  nextPlayerIndex,
  pileTotalCount,
} from '../../src/core/rules.js';
import type { Card, Play, Round } from '../../src/core/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCard(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { id: `${rank}-${suit ?? 'null'}`, rank, suit };
}

function makeJoker(n: 0 | 1 = 0): Card {
  return { id: `joker-${n}`, rank: 'joker', suit: null };
}

function makePlay(cards: Card[], claimedRank: Card['rank']): Play {
  return {
    playerId: 'p1',
    cards,
    claimedRank,
    claimedCount: cards.length,
    timestamp: Date.now(),
  };
}

function makeRound(lockedRank: Card['rank']): Round {
  return { lockedRank, plays: [], startPlayerId: 'p1', activePlayerId: 'p1' };
}

// Round that already has one play — locked rank is actively enforced
function makeRoundWithPlay(lockedRank: Card['rank']): Round {
  const firstPlay: Play = {
    playerId: 'p0',
    cards: [makeCard(lockedRank)],
    claimedRank: lockedRank,
    claimedCount: 1,
    timestamp: 0,
  };
  return { lockedRank, plays: [firstPlay], startPlayerId: 'p0', activePlayerId: 'p1' };
}

function connectedPlayers(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i}`,
    isConnected: true,
  }));
}

// ── validatePlay ──────────────────────────────────────────────────────────

describe('validatePlay', () => {
  it('rejects empty card selection', () => {
    const hand = [makeCard('7')];
    const result = validatePlay([], '7', hand, null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least one card/i);
  });

  it('rejects a card ID not in the player hand', () => {
    const hand = [makeCard('7', 'hearts')];
    const result = validatePlay(['K-spades'], '7', hand, null);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('K-spades');
  });

  it('allows playing cards that are in the hand with no round (first play)', () => {
    const card = makeCard('9', 'clubs');
    const hand = [card, makeCard('Q', 'diamonds')];
    const result = validatePlay([card.id], '9', hand, null);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects claiming "joker" as a rank', () => {
    const card = makeCard('A', 'hearts');
    const hand = [card];
    // @ts-expect-error — testing invalid rank at runtime
    const result = validatePlay([card.id], 'joker', hand, null);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/joker/i);
  });

  it('allows any rank on the first play of a new round (joker placeholder, plays empty)', () => {
    const card = makeCard('A', 'spades');
    const hand = [card];
    // Engine initialises lockedRank to 'joker' as a placeholder before the first play locks it
    const round = makeRound('joker' as Card['rank']);
    const result = validatePlay([card.id], 'A', hand, round);
    expect(result.valid).toBe(true);
  });

  it('rejects a claim that does not match the locked rank (after first play has locked it)', () => {
    const card = makeCard('K', 'spades');
    const hand = [card];
    const round = makeRoundWithPlay('7');
    const result = validatePlay([card.id], 'K', hand, round);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/locked/i);
  });

  it('accepts a play when the claimed rank matches the locked rank', () => {
    const card = makeCard('7', 'diamonds');
    const hand = [card, makeCard('J', 'clubs')];
    const round = makeRoundWithPlay('7');
    const result = validatePlay([card.id], '7', hand, round);
    expect(result.valid).toBe(true);
  });

  it('accepts a joker card played alongside real cards with any first-play claim', () => {
    const joker = makeJoker(0);
    const real = makeCard('A', 'spades');
    const hand = [joker, real, makeCard('Q', 'clubs')];
    // No locked round — player freely claims 'A'
    const result = validatePlay([joker.id, real.id], 'A', hand, null);
    expect(result.valid).toBe(true);
  });

  it('accepts a joker card alone claimed as a non-joker rank when round is locked', () => {
    const joker = makeJoker(1);
    const hand = [joker, makeCard('Q', 'diamonds')];
    const round = makeRoundWithPlay('7');
    // Joker is wild — playing it and claiming '7' is valid because '7' matches locked rank
    const result = validatePlay([joker.id], '7', hand, round);
    expect(result.valid).toBe(true);
  });

  it('rejects card not in hand even when rank would match locked round', () => {
    const hand = [makeCard('7', 'hearts')];
    const round = makeRound('7');
    const result = validatePlay(['7-spades'], '7', hand, round);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('7-spades');
  });

  it('allows playing multiple cards from hand with matching locked rank', () => {
    const c1 = makeCard('K', 'hearts');
    const c2 = makeCard('K', 'diamonds');
    const c3 = makeCard('J', 'clubs');
    const hand = [c1, c2, c3];
    const round = makeRoundWithPlay('K');
    const result = validatePlay([c1.id, c2.id], 'K', hand, round);
    expect(result.valid).toBe(true);
  });
});

// ── resolveBluff ──────────────────────────────────────────────────────────

describe('resolveBluff', () => {
  it('returns "truth" when all cards match the claimed rank', () => {
    const cards = [makeCard('7', 'hearts'), makeCard('7', 'clubs')];
    const play = makePlay(cards, '7');
    expect(resolveBluff(play)).toBe('truth');
  });

  it('returns "liar" when any card does not match the claimed rank', () => {
    const cards = [makeCard('7', 'hearts'), makeCard('K', 'spades')];
    const play = makePlay(cards, '7');
    expect(resolveBluff(play)).toBe('liar');
  });

  it('returns "liar" when the single card does not match', () => {
    const cards = [makeCard('Q', 'diamonds')];
    const play = makePlay(cards, 'J');
    expect(resolveBluff(play)).toBe('liar');
  });

  it('returns "truth" when all cards are jokers (jokers are wild)', () => {
    const cards = [makeJoker(0), makeJoker(1)];
    const play = makePlay(cards, 'A');
    expect(resolveBluff(play)).toBe('truth');
  });

  it('returns "truth" when mixed joker + cards matching claimed rank', () => {
    const cards = [makeJoker(0), makeCard('A', 'hearts'), makeCard('A', 'clubs')];
    const play = makePlay(cards, 'A');
    expect(resolveBluff(play)).toBe('truth');
  });

  it('returns "liar" when joker is mixed with a wrong-rank card', () => {
    const cards = [makeJoker(0), makeCard('2', 'spades')];
    const play = makePlay(cards, 'A');
    expect(resolveBluff(play)).toBe('liar');
  });

  it('returns "truth" for a single matching card', () => {
    const cards = [makeCard('Q', 'hearts')];
    const play = makePlay(cards, 'Q');
    expect(resolveBluff(play)).toBe('truth');
  });
});

// ── checkWin ──────────────────────────────────────────────────────────────

describe('checkWin', () => {
  it('returns true for an empty hand', () => {
    expect(checkWin([])).toBe(true);
  });

  it('returns false for a hand with one card', () => {
    expect(checkWin([makeCard('A', 'spades')])).toBe(false);
  });

  it('returns false for a hand with many cards', () => {
    const hand = [
      makeCard('2', 'hearts'),
      makeCard('7', 'clubs'),
      makeCard('K', 'diamonds'),
      makeJoker(0),
    ];
    expect(checkWin(hand)).toBe(false);
  });
});

// ── nextPlayerIndex ───────────────────────────────────────────────────────

describe('nextPlayerIndex', () => {
  it('advances from index 0 to index 1 in a 3-player game (all connected)', () => {
    const players = connectedPlayers(3);
    expect(nextPlayerIndex(players, 0)).toBe(1);
  });

  it('advances from index 1 to index 2', () => {
    const players = connectedPlayers(3);
    expect(nextPlayerIndex(players, 1)).toBe(2);
  });

  it('wraps from the last player back to index 0', () => {
    const players = connectedPlayers(3);
    expect(nextPlayerIndex(players, 2)).toBe(0);
  });

  it('wraps correctly with 2 players', () => {
    const players = connectedPlayers(2);
    expect(nextPlayerIndex(players, 0)).toBe(1);
    expect(nextPlayerIndex(players, 1)).toBe(0);
  });

  it('skips a disconnected player', () => {
    const players = [
      { id: 'p0', isConnected: true },
      { id: 'p1', isConnected: false },
      { id: 'p2', isConnected: true },
    ];
    // From p0 (index 0), p1 is disconnected, so next should be p2 (index 2)
    expect(nextPlayerIndex(players, 0)).toBe(2);
  });

  it('skips multiple consecutive disconnected players', () => {
    const players = [
      { id: 'p0', isConnected: true },
      { id: 'p1', isConnected: false },
      { id: 'p2', isConnected: false },
      { id: 'p3', isConnected: true },
    ];
    expect(nextPlayerIndex(players, 0)).toBe(3);
  });

  it('wraps past the end while skipping disconnected players', () => {
    const players = [
      { id: 'p0', isConnected: true },
      { id: 'p1', isConnected: true },
      { id: 'p2', isConnected: false },
    ];
    // From index 1, next connected after wrap is index 0
    expect(nextPlayerIndex(players, 1)).toBe(0);
  });

  it('throws when no connected players remain', () => {
    const players = [
      { id: 'p0', isConnected: false },
      { id: 'p1', isConnected: false },
    ];
    expect(() => nextPlayerIndex(players, 0)).toThrow();
  });
});

// ── pileTotalCount ────────────────────────────────────────────────────────

describe('pileTotalCount', () => {
  it('returns 0 for an empty plays array', () => {
    expect(pileTotalCount([])).toBe(0);
  });

  it('returns the count for a single play', () => {
    const play = makePlay([makeCard('7', 'hearts'), makeCard('7', 'clubs')], '7');
    expect(pileTotalCount([play])).toBe(2);
  });

  it('returns the sum of card counts across multiple plays', () => {
    const p1 = makePlay([makeCard('A', 'hearts')], 'A');
    const p2 = makePlay([makeCard('A', 'diamonds'), makeCard('A', 'spades')], 'A');
    const p3 = makePlay([makeCard('A', 'clubs'), makeJoker(0), makeJoker(1)], 'A');
    expect(pileTotalCount([p1, p2, p3])).toBe(6);
  });

  it('handles plays where a player put down 1 card each', () => {
    const plays = [
      makePlay([makeCard('K', 'hearts')], 'K'),
      makePlay([makeCard('K', 'spades')], 'K'),
      makePlay([makeCard('2', 'clubs')], 'K'), // liar — but count still 1
    ];
    expect(pileTotalCount(plays)).toBe(3);
  });
});
