import type { Card, Rank, Suit } from './types.js';

const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
const RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

export function buildDeck(): Card[] {
  // 52 standard cards + 2 jokers = 54 total
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${rank}-${suit}`, rank, suit });
    }
  }
  cards.push({ id: 'joker-0', rank: 'joker', suit: null });
  cards.push({ id: 'joker-1', rank: 'joker', suit: null });
  return cards;
}

export function shuffle(deck: Card[]): Card[] {
  // Fisher-Yates, returns a new array (does not mutate input)
  const arr = [...deck];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    // swap
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function deal(deck: Card[], playerCount: number): Card[][] {
  // Distributes all cards evenly round-robin. Max hand-size difference is 1.
  // Returns array of hands, one per player, in player order.
  if (playerCount < 2 || playerCount > 6) {
    throw new Error(`Invalid player count: ${playerCount}. Must be 2–6.`);
  }
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  for (let i = 0; i < deck.length; i++) {
    hands[i % playerCount]!.push(deck[i]!);
  }
  return hands;
}
