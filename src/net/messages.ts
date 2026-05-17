import type { ClientGameState, Play, Rank } from '../core/types.js';

export type ClientIntent =
  | { type: 'JOIN'; name: string }
  | { type: 'PLAY_CARDS'; cardIds: string[]; claimedRank: Rank }
  | { type: 'CALL_BLUFF' }
  | { type: 'CONFIRM_PICKUP' }
  | { type: 'START_NEXT_ROUND' }
  | { type: 'PING' };

export type HostMessage =
  | { type: 'WELCOME'; yourId: string }
  | { type: 'STATE'; state: ClientGameState }
  | { type: 'REVEAL'; lastPlay: Play; verdict: 'liar' | 'truth'; pickupPlayerId: string }
  | { type: 'ERROR'; message: string }
  | { type: 'PONG' }
  | { type: 'PLAYER_LEFT'; playerId: string };
