import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  applyDeal,
  transitionToPlaying,
  applyPlay,
  applyBluffCall,
  applyBluffResult,
  checkAndApplyWin,
  startNewRound,
  collectPile,
  lastPlay,
} from '../../src/core/state.js';
import { buildDeck, deal } from '../../src/core/deck.js';
import type { Card, GameState, Play, Player } from '../../src/core/types.js';

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayers(names: string[]): Player[] {
  return names.map((name, i) => ({
    id: `p${i}`,
    name,
    cardCount: 0,
    isConnected: true,
  }));
}

function makeCard(rank: Card['rank'], suit: Card['suit'] = 'spades'): Card {
  return { id: `${rank}-${suit ?? 'null'}`, rank, suit };
}

function makeJoker(n: 0 | 1 = 0): Card {
  return { id: `joker-${n}`, rank: 'joker', suit: null };
}

function makePlay(
  playerId: string,
  cards: Card[],
  claimedRank: Card['rank'],
): Play {
  return {
    playerId,
    cards,
    claimedRank,
    claimedCount: cards.length,
    timestamp: Date.now(),
  };
}

/**
 * Build a realistic lobby state for `count` players, then deal using the
 * standard deck so the state is fully consistent.
 */
function buildDealtState(playerNames: string[]): GameState {
  const players = makePlayers(playerNames);
  const lobby = createInitialState(players, 'loud');
  const deck = buildDeck();
  const hands = deal(deck, players.length);
  const handsByPlayerId: Record<string, Card[]> = {};
  for (let i = 0; i < players.length; i++) {
    handsByPlayerId[players[i]!.id] = hands[i]!;
  }
  return applyDeal(lobby, handsByPlayerId);
}

// ── createInitialState ────────────────────────────────────────────────────

describe('createInitialState', () => {
  it('phase is "lobby"', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const state = createInitialState(players, 'loud');
    expect(state.phase).toBe('lobby');
  });

  it('all hands are empty arrays', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const state = createInitialState(players, 'loud');
    for (const p of players) {
      expect(state.hands[p.id]).toEqual([]);
    }
  });

  it('sets playMode to "loud" correctly', () => {
    const state = createInitialState(makePlayers(['Alice', 'Bob']), 'loud');
    expect(state.playMode).toBe('loud');
  });

  it('sets playMode to "silent" correctly', () => {
    const state = createInitialState(makePlayers(['Alice', 'Bob']), 'silent');
    expect(state.playMode).toBe('silent');
  });

  it('winnerId is null', () => {
    const state = createInitialState(makePlayers(['Alice', 'Bob']), 'loud');
    expect(state.winnerId).toBeNull();
  });

  it('currentRound is null', () => {
    const state = createInitialState(makePlayers(['Alice', 'Bob']), 'loud');
    expect(state.currentRound).toBeNull();
  });
});

// ── applyDeal ──────────────────────────────────────────────────────────────

describe('applyDeal', () => {
  it('phase becomes "dealing"', () => {
    const state = buildDealtState(['Alice', 'Bob']);
    expect(state.phase).toBe('dealing');
  });

  it('player cardCounts match their hand sizes after dealing', () => {
    const state = buildDealtState(['Alice', 'Bob', 'Charlie']);
    for (const player of state.players) {
      const handSize = state.hands[player.id]?.length ?? 0;
      expect(player.cardCount).toBe(handSize);
    }
  });

  it('hands are set correctly per player', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand = [makeCard('7', 'hearts'), makeCard('K', 'spades')];
    const bobHand = [makeCard('A', 'clubs'), makeCard('Q', 'diamonds'), makeCard('2', 'hearts')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    expect(dealt.hands['p0']).toEqual(aliceHand);
    expect(dealt.hands['p1']).toEqual(bobHand);
  });

  it('players who receive 0 cards have cardCount 0', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    // Intentionally give Bob an empty hand (edge-case)
    const dealt = applyDeal(lobby, { p0: [makeCard('A', 'spades')], p1: [] });
    const bob = dealt.players.find(p => p.id === 'p1')!;
    expect(bob.cardCount).toBe(0);
  });

  it('does not mutate the original lobby state', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    applyDeal(lobby, { p0: [makeCard('7', 'hearts')], p1: [makeCard('K', 'clubs')] });
    expect(lobby.phase).toBe('lobby');
  });
});

// ── transitionToPlaying ───────────────────────────────────────────────────

describe('transitionToPlaying', () => {
  it('phase becomes "playing"', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    expect(playing.phase).toBe('playing');
  });

  it('currentRound is created with the correct activePlayerId', () => {
    const dealt = buildDealtState(['Alice', 'Bob', 'Charlie']);
    const playing = transitionToPlaying(dealt, 'p1');
    expect(playing.currentRound?.activePlayerId).toBe('p1');
  });

  it('currentRound.plays is an empty array', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    expect(playing.currentRound?.plays).toEqual([]);
  });

  it('currentRound.startPlayerId matches the first active player', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    expect(playing.currentRound?.startPlayerId).toBe('p0');
  });
});

// ── applyPlay ─────────────────────────────────────────────────────────────

describe('applyPlay — first play locks the rank', () => {
  function buildPlayingState() {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const lobby = createInitialState(players, 'loud');
    // Give each player a known hand
    const aliceHand: Card[] = [
      makeCard('7', 'hearts'),
      makeCard('7', 'clubs'),
      makeCard('K', 'spades'),
      makeCard('2', 'diamonds'),
    ];
    const bobHand: Card[] = [makeCard('7', 'diamonds'), makeCard('A', 'spades')];
    const charlieHand: Card[] = [makeCard('7', 'spades'), makeCard('Q', 'hearts')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand, p2: charlieHand });
    return transitionToPlaying(dealt, 'p0');
  }

  it('played cards are removed from the player\'s hand', () => {
    const state = buildPlayingState();
    const play = makePlay('p0', [makeCard('7', 'hearts'), makeCard('7', 'clubs')], '7');
    const next = applyPlay(state, play);
    const aliceHand = next.hands['p0']!;
    expect(aliceHand.some(c => c.id === '7-hearts')).toBe(false);
    expect(aliceHand.some(c => c.id === '7-clubs')).toBe(false);
  });

  it('player\'s cardCount is decremented by the number of cards played', () => {
    const state = buildPlayingState();
    const originalCount = state.players.find(p => p.id === 'p0')!.cardCount;
    const play = makePlay('p0', [makeCard('7', 'hearts')], '7');
    const next = applyPlay(state, play);
    const alice = next.players.find(p => p.id === 'p0')!;
    expect(alice.cardCount).toBe(originalCount - 1);
  });

  it('round\'s lockedRank is set to the claimed rank on the first play', () => {
    const state = buildPlayingState();
    const play = makePlay('p0', [makeCard('7', 'hearts')], '7');
    const next = applyPlay(state, play);
    expect(next.currentRound?.lockedRank).toBe('7');
  });

  it('play is appended to round.plays', () => {
    const state = buildPlayingState();
    const play = makePlay('p0', [makeCard('7', 'hearts')], '7');
    const next = applyPlay(state, play);
    expect(next.currentRound?.plays).toHaveLength(1);
    expect(next.currentRound?.plays[0]).toEqual(play);
  });

  it('activePlayerId advances to the next player', () => {
    const state = buildPlayingState();
    const play = makePlay('p0', [makeCard('7', 'hearts')], '7');
    const next = applyPlay(state, play);
    // Alice (p0) → Bob (p1)
    expect(next.currentRound?.activePlayerId).toBe('p1');
  });
});

describe('applyPlay — follow-up play', () => {
  function buildStateAfterFirstPlay() {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('7', 'hearts'), makeCard('K', 'spades')];
    const bobHand: Card[] = [makeCard('7', 'diamonds'), makeCard('A', 'spades'), makeCard('9', 'clubs')];
    const charlieHand: Card[] = [makeCard('7', 'spades'), makeCard('Q', 'hearts'), makeCard('J', 'clubs')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand, p2: charlieHand });
    const playing = transitionToPlaying(dealt, 'p0');
    const alicePlay = makePlay('p0', [makeCard('7', 'hearts')], '7');
    return applyPlay(playing, alicePlay);
  }

  it('lockedRank stays the same on a follow-up play', () => {
    const state = buildStateAfterFirstPlay(); // locked to '7', Bob's turn
    const bobPlay = makePlay('p1', [makeCard('7', 'diamonds')], '7');
    const next = applyPlay(state, bobPlay);
    expect(next.currentRound?.lockedRank).toBe('7');
  });

  it('activePlayerId advances again after the follow-up play', () => {
    const state = buildStateAfterFirstPlay();
    const bobPlay = makePlay('p1', [makeCard('7', 'diamonds')], '7');
    const next = applyPlay(state, bobPlay);
    // Bob (p1) → Charlie (p2)
    expect(next.currentRound?.activePlayerId).toBe('p2');
  });

  it('pile grows with each successive play', () => {
    const state = buildStateAfterFirstPlay();
    const bobPlay = makePlay('p1', [makeCard('A', 'spades'), makeCard('9', 'clubs')], '7'); // bluffing
    const next = applyPlay(state, bobPlay);
    expect(next.currentRound?.plays).toHaveLength(2);
    expect(next.currentRound?.plays[1]).toEqual(bobPlay);
  });
});

// ── applyBluffCall ────────────────────────────────────────────────────────

describe('applyBluffCall', () => {
  it('phase becomes "revealing"', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    const afterPlay = applyPlay(playing, makePlay('p0', [makeCard('A', 'spades')], 'A'));
    const revealing = applyBluffCall(afterPlay);
    expect(revealing.phase).toBe('revealing');
  });

  it('does not clear the round', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    const afterPlay = applyPlay(playing, makePlay('p0', [makeCard('A', 'spades')], 'A'));
    const revealing = applyBluffCall(afterPlay);
    expect(revealing.currentRound).not.toBeNull();
  });
});

// ── applyBluffResult ──────────────────────────────────────────────────────

describe('applyBluffResult', () => {
  function buildRevealingState() {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('A', 'hearts'), makeCard('A', 'clubs')];
    const bobHand: Card[] = [makeCard('K', 'spades'), makeCard('Q', 'diamonds')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    const playing = transitionToPlaying(dealt, 'p0');
    // Alice plays 2 cards claiming 'A'
    const afterPlay = applyPlay(
      playing,
      makePlay('p0', [makeCard('A', 'hearts'), makeCard('A', 'clubs')], 'A'),
    );
    return applyBluffCall(afterPlay);
  }

  it('pickup player\'s hand gains all pile cards', () => {
    const state = buildRevealingState();
    const pileCards = collectPile(state);
    const beforeCount = state.hands['p1']?.length ?? 0;
    const after = applyBluffResult(state, 'p1', pileCards);
    expect(after.hands['p1']).toHaveLength(beforeCount + pileCards.length);
  });

  it('pickup player\'s cardCount increases by pile size', () => {
    const state = buildRevealingState();
    const pileCards = collectPile(state);
    const before = state.players.find(p => p.id === 'p1')!.cardCount;
    const after = applyBluffResult(state, 'p1', pileCards);
    const afterPlayer = after.players.find(p => p.id === 'p1')!;
    expect(afterPlayer.cardCount).toBe(before + pileCards.length);
  });

  it('currentRound is cleared to null', () => {
    const state = buildRevealingState();
    const pileCards = collectPile(state);
    const after = applyBluffResult(state, 'p1', pileCards);
    expect(after.currentRound).toBeNull();
  });

  it('phase becomes "pickup"', () => {
    const state = buildRevealingState();
    const pileCards = collectPile(state);
    const after = applyBluffResult(state, 'p1', pileCards);
    expect(after.phase).toBe('pickup');
  });

  it('other players\' hands are unaffected', () => {
    const state = buildRevealingState();
    const pileCards = collectPile(state);
    const aliceHandBefore = [...(state.hands['p0'] ?? [])];
    const after = applyBluffResult(state, 'p1', pileCards);
    // Alice played her cards so her hand should be empty — unchanged from what state recorded
    expect(after.hands['p0']).toEqual(aliceHandBefore);
  });
});

// ── checkAndApplyWin ──────────────────────────────────────────────────────

describe('checkAndApplyWin', () => {
  it('sets winnerId and phase "ended" when candidate player\'s hand is empty', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const dealt = applyDeal(lobby, {
      p0: [], // Alice has no cards left
      p1: [makeCard('K', 'spades')],
    });
    const result = checkAndApplyWin(dealt, 'p0');
    expect(result.phase).toBe('ended');
    expect(result.winnerId).toBe('p0');
  });

  it('returns the state unchanged when the candidate player still has cards', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const dealt = applyDeal(lobby, {
      p0: [makeCard('7', 'hearts')],
      p1: [makeCard('K', 'spades')],
    });
    const result = checkAndApplyWin(dealt, 'p0');
    expect(result.phase).toBe('dealing');
    expect(result.winnerId).toBeNull();
    expect(result).toBe(dealt); // same reference — no new state created
  });

  it('works from a pickup phase where player collected cards (no win)', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const played = applyDeal(lobby, {
      p0: [makeCard('7', 'hearts'), makeCard('K', 'spades')],
      p1: [],
    });
    const result = checkAndApplyWin(played, 'p1');
    expect(result.phase).toBe('ended');
    expect(result.winnerId).toBe('p1');
  });
});

// ── startNewRound ─────────────────────────────────────────────────────────

describe('startNewRound', () => {
  it('phase becomes "playing"', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const pickup = { ...dealt, phase: 'pickup' as const };
    const newRound = startNewRound(pickup, 'p1');
    expect(newRound.phase).toBe('playing');
  });

  it('new round has the specified startPlayerId as activePlayerId', () => {
    const dealt = buildDealtState(['Alice', 'Bob', 'Charlie']);
    const pickup = { ...dealt, phase: 'pickup' as const };
    const newRound = startNewRound(pickup, 'p2');
    expect(newRound.currentRound?.activePlayerId).toBe('p2');
    expect(newRound.currentRound?.startPlayerId).toBe('p2');
  });

  it('new round\'s plays array is empty', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const pickup = { ...dealt, phase: 'pickup' as const };
    const newRound = startNewRound(pickup, 'p0');
    expect(newRound.currentRound?.plays).toEqual([]);
  });

  it('preserves hands and player data when starting a new round', () => {
    const state = buildDealtState(['Alice', 'Bob']);
    const newRound = startNewRound(state, 'p0');
    expect(newRound.players).toEqual(state.players);
    expect(newRound.hands).toEqual(state.hands);
  });
});

// ── collectPile ───────────────────────────────────────────────────────────

describe('collectPile', () => {
  it('returns empty array when there is no current round', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const state = createInitialState(players, 'loud');
    expect(collectPile(state)).toEqual([]);
  });

  it('returns empty array when round has no plays yet', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    expect(collectPile(playing)).toEqual([]);
  });

  it('returns all cards from all plays in the current round', () => {
    const players = makePlayers(['Alice', 'Bob', 'Charlie']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('7', 'hearts'), makeCard('7', 'clubs')];
    const bobHand: Card[] = [makeCard('7', 'diamonds'), makeCard('A', 'spades')];
    const charlieHand: Card[] = [makeCard('7', 'spades'), makeJoker(0)];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand, p2: charlieHand });
    const playing = transitionToPlaying(dealt, 'p0');

    const p1 = makePlay('p0', [makeCard('7', 'hearts'), makeCard('7', 'clubs')], '7');
    const s1 = applyPlay(playing, p1);
    const p2 = makePlay('p1', [makeCard('7', 'diamonds')], '7');
    const s2 = applyPlay(s1, p2);

    const pile = collectPile(s2);
    expect(pile).toHaveLength(3);
    const pileIds = new Set(pile.map(c => c.id));
    expect(pileIds.has('7-hearts')).toBe(true);
    expect(pileIds.has('7-clubs')).toBe(true);
    expect(pileIds.has('7-diamonds')).toBe(true);
  });

  it('includes cards from all plays, not just the last one', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('A', 'hearts'), makeCard('A', 'clubs')];
    const bobHand: Card[] = [makeCard('A', 'spades'), makeCard('K', 'diamonds')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    const playing = transitionToPlaying(dealt, 'p0');

    const play1 = makePlay('p0', [makeCard('A', 'hearts'), makeCard('A', 'clubs')], 'A');
    const s1 = applyPlay(playing, play1);
    const play2 = makePlay('p1', [makeCard('A', 'spades'), makeCard('K', 'diamonds')], 'A');
    const s2 = applyPlay(s1, play2);

    expect(collectPile(s2)).toHaveLength(4);
  });
});

// ── lastPlay ──────────────────────────────────────────────────────────────

describe('lastPlay', () => {
  it('returns null when there is no current round', () => {
    const state = createInitialState(makePlayers(['Alice', 'Bob']), 'loud');
    expect(lastPlay(state)).toBeNull();
  });

  it('returns null when the round has no plays yet', () => {
    const dealt = buildDealtState(['Alice', 'Bob']);
    const playing = transitionToPlaying(dealt, 'p0');
    expect(lastPlay(playing)).toBeNull();
  });

  it('returns the single play when there is exactly one', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('Q', 'hearts'), makeCard('K', 'spades')];
    const bobHand: Card[] = [makeCard('Q', 'clubs'), makeCard('A', 'diamonds')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    const playing = transitionToPlaying(dealt, 'p0');
    const play = makePlay('p0', [makeCard('Q', 'hearts')], 'Q');
    const after = applyPlay(playing, play);
    const lp = lastPlay(after);
    expect(lp).not.toBeNull();
    expect(lp!.playerId).toBe('p0');
    expect(lp!.claimedRank).toBe('Q');
  });

  it('returns the most recent play when there are multiple plays', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('Q', 'hearts'), makeCard('K', 'spades')];
    const bobHand: Card[] = [makeCard('Q', 'clubs'), makeCard('A', 'diamonds'), makeCard('2', 'clubs')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    const playing = transitionToPlaying(dealt, 'p0');

    const play1 = makePlay('p0', [makeCard('Q', 'hearts')], 'Q');
    const s1 = applyPlay(playing, play1);
    const play2 = makePlay('p1', [makeCard('A', 'diamonds')], 'Q'); // bluff
    const s2 = applyPlay(s1, play2);

    const lp = lastPlay(s2);
    expect(lp!.playerId).toBe('p1');
    expect(lp!.claimedRank).toBe('Q');
    expect(lp!.cards[0]?.rank).toBe('A'); // actual card was an Ace
  });

  it('returns null again after bluffResult clears the round', () => {
    const players = makePlayers(['Alice', 'Bob']);
    const lobby = createInitialState(players, 'loud');
    const aliceHand: Card[] = [makeCard('K', 'hearts')];
    const bobHand: Card[] = [makeCard('Q', 'spades')];
    const dealt = applyDeal(lobby, { p0: aliceHand, p1: bobHand });
    const playing = transitionToPlaying(dealt, 'p0');
    const play = makePlay('p0', [makeCard('K', 'hearts')], 'K');
    const s1 = applyPlay(playing, play);
    const revealing = applyBluffCall(s1);
    const pile = collectPile(revealing);
    const after = applyBluffResult(revealing, 'p1', pile);
    expect(lastPlay(after)).toBeNull();
  });
});
