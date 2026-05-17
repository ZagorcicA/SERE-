export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A' | 'joker';

export type PlayMode = 'loud' | 'silent';

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'playing'
  | 'revealing'
  | 'pickup'
  | 'ended';

export interface Card {
  id: string;       // e.g. "7-hearts", "J-spades", "joker-0", "joker-1"
  rank: Rank;
  suit: Suit | null; // null for jokers
}

export interface Player {
  id: string;       // PeerJS peer ID (host uses 'host' as id)
  name: string;
  cardCount: number;
  isConnected: boolean;
}

export interface Play {
  playerId: string;
  cards: Card[];         // Actual cards — host-only, never sent raw to clients
  claimedRank: Rank;
  claimedCount: number;
  timestamp: number;
}

export interface Round {
  lockedRank: Rank;      // Set by first play, immutable for the round
  plays: Play[];         // Full play history — host-only
  startPlayerId: string;
  activePlayerId: string;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];                  // Ordered by turn sequence
  hands: Record<string, Card[]>;      // playerId → full hand — NEVER send to clients
  currentRound: Round | null;
  winnerId: string | null;
  playMode: PlayMode;
}

// ── Client-safe types (redacted, safe to send over the network) ──

export interface ClaimSummary {
  playerId: string;
  playerName: string;
  claimedCount: number;
  claimedRank: Rank;
}

export interface ClientRound {
  lockedRank: Rank;
  totalPileCount: number;   // Sum of all cards played in this round
  lastPlayCount: number;    // Cards in the most recent play (for SEREŠ? context)
  activePlayerId: string;
  startPlayerId: string;
  claimChain: ClaimSummary[];
}

export interface ClientGameState {
  phase: GamePhase;
  players: Player[];
  myHand: Card[];
  myId: string;
  currentRound: ClientRound | null;
  winnerId: string | null;
  playMode: PlayMode;
}
