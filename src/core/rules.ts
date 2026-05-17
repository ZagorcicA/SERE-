import type { Card, Play, Rank, Round } from './types.js';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a play intent before committing it.
 *
 * @param cardIds   IDs of cards the player wants to play
 * @param claimedRank  Rank being claimed
 * @param hand      The player's current hand
 * @param round     Current round (null if this is the round-starting play)
 */
export function validatePlay(
  cardIds: string[],
  claimedRank: Rank,
  hand: Card[],
  round: Round | null,
): ValidationResult {
  if (cardIds.length === 0) {
    return { valid: false, error: 'Must play at least one card.' };
  }

  const handIds = new Set(hand.map(c => c.id));
  for (const id of cardIds) {
    if (!handIds.has(id)) {
      return { valid: false, error: `Card ${id} is not in your hand.` };
    }
  }

  if (claimedRank === 'joker') {
    return { valid: false, error: 'Cannot claim "joker" as a rank. Jokers are wild.' };
  }

  // Only enforce the locked rank after the first play has set it
  if (round !== null && round.plays.length > 0 && claimedRank !== round.lockedRank) {
    return {
      valid: false,
      error: `This round's rank is locked to ${round.lockedRank}. You must claim that rank.`,
    };
  }

  return { valid: true };
}

/**
 * Resolve a bluff call against the last play in the round.
 * Returns 'liar' if any non-joker card does not match the claimed rank.
 * Returns 'truth' if all cards are jokers or match the claimed rank.
 */
export function resolveBluff(lastPlay: Play): 'liar' | 'truth' {
  for (const card of lastPlay.cards) {
    if (card.rank !== 'joker' && card.rank !== lastPlay.claimedRank) {
      return 'liar';
    }
  }
  return 'truth';
}

/** True when the player's hand is empty (win condition). */
export function checkWin(hand: Card[]): boolean {
  return hand.length === 0;
}

/**
 * Return the index of the next connected player, advancing clockwise.
 * Wraps around. Skips disconnected players.
 * Throws if no connected players remain.
 */
export function nextPlayerIndex(
  players: readonly { isConnected: boolean }[],
  currentIndex: number,
): number {
  const n = players.length;
  for (let step = 1; step <= n; step++) {
    const idx = (currentIndex + step) % n;
    if (players[idx]!.isConnected) return idx;
  }
  throw new Error('No connected players remaining.');
}

/**
 * Compute the total number of cards in the round's pile
 * (sum of all plays' card counts).
 */
export function pileTotalCount(plays: Play[]): number {
  return plays.reduce((sum, p) => sum + p.cards.length, 0);
}
