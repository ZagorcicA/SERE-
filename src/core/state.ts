import type { Card, GameState, Play, Player, PlayMode, Rank } from './types.js';
import { checkWin, nextPlayerIndex } from './rules.js';

export function createInitialState(players: Player[], playMode: PlayMode): GameState {
  const hands: Record<string, Card[]> = {};
  for (const p of players) hands[p.id] = [];
  return {
    phase: 'lobby',
    players,
    hands,
    currentRound: null,
    winnerId: null,
    playMode,
  };
}

export function applyDeal(state: GameState, handsByPlayerId: Record<string, Card[]>): GameState {
  const players = state.players.map(p => ({
    ...p,
    cardCount: (handsByPlayerId[p.id] ?? []).length,
  }));
  return { ...state, phase: 'dealing', players, hands: { ...handsByPlayerId } };
}

export function transitionToPlaying(state: GameState, firstActivePlayerId: string): GameState {
  return {
    ...state,
    phase: 'playing',
    currentRound: {
      lockedRank: 'joker' as Rank, // placeholder — will be locked on first play
      plays: [],
      startPlayerId: firstActivePlayerId,
      activePlayerId: firstActivePlayerId,
    },
  };
}

/**
 * Apply a validated play. Locks the round rank on first play.
 * Updates the player's hand and card count.
 * Advances the active player.
 * If the player's hand is now empty, phase stays 'playing' —
 * the engine checks for win after the next player has the option to call SEREŠ?.
 */
export function applyPlay(state: GameState, play: Play): GameState {
  const round = state.currentRound!;
  const isFirstPlay = round.plays.length === 0;
  const lockedRank = isFirstPlay ? play.claimedRank : round.lockedRank;

  const playedIds = new Set(play.cards.map(c => c.id));
  const newHand = (state.hands[play.playerId] ?? []).filter(c => !playedIds.has(c.id));

  const players = state.players.map(p =>
    p.id === play.playerId ? { ...p, cardCount: newHand.length } : p,
  );

  const currentIndex = players.findIndex(p => p.id === play.playerId);
  const nextIndex = nextPlayerIndex(players, currentIndex);

  return {
    ...state,
    players,
    hands: { ...state.hands, [play.playerId]: newHand },
    currentRound: {
      ...round,
      lockedRank,
      plays: [...round.plays, play],
      activePlayerId: players[nextIndex]!.id,
    },
  };
}

/** Transition to 'revealing' phase when SEREŠ? is called. */
export function applyBluffCall(state: GameState): GameState {
  return { ...state, phase: 'revealing' };
}

/**
 * Apply the result of a bluff resolution.
 * The pickup player receives all pile cards.
 * Transitions to 'pickup' phase.
 */
export function applyBluffResult(
  state: GameState,
  pickupPlayerId: string,
  pileCards: Card[],
): GameState {
  const newHand = [...(state.hands[pickupPlayerId] ?? []), ...pileCards];
  const players = state.players.map(p =>
    p.id === pickupPlayerId ? { ...p, cardCount: newHand.length } : p,
  );
  return {
    ...state,
    phase: 'pickup',
    players,
    hands: { ...state.hands, [pickupPlayerId]: newHand },
    currentRound: null,
  };
}

/**
 * Check if a player has won (empty hand and phase is 'pickup' meaning they just played last card
 * and the bluff check passed, or the round ended without a call).
 * Returns updated state with winnerId set and phase 'ended' if so.
 */
export function checkAndApplyWin(state: GameState, candidatePlayerId: string): GameState {
  const hand = state.hands[candidatePlayerId] ?? [];
  if (checkWin(hand)) {
    return { ...state, phase: 'ended', winnerId: candidatePlayerId };
  }
  return state;
}

/**
 * Start a new round. Called after pickup is animated.
 * The pickup player starts the new round (they choose the rank via their first play).
 */
export function startNewRound(state: GameState, startPlayerId: string): GameState {
  return {
    ...state,
    phase: 'playing',
    currentRound: {
      lockedRank: 'joker' as Rank, // placeholder until first play locks it
      plays: [],
      startPlayerId,
      activePlayerId: startPlayerId,
    },
  };
}

/** Collect all cards from the current round's plays into a flat pile. */
export function collectPile(state: GameState): Card[] {
  if (!state.currentRound) return [];
  return state.currentRound.plays.flatMap(p => p.cards);
}

/** Return the last play in the current round, or null. */
export function lastPlay(state: GameState): Play | null {
  if (!state.currentRound || state.currentRound.plays.length === 0) return null;
  return state.currentRound.plays[state.currentRound.plays.length - 1] ?? null;
}
