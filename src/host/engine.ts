import { buildDeck, deal, shuffle } from '../core/deck.js';
import { nextPlayerIndex, resolveBluff, validatePlay } from '../core/rules.js';
import {
  applyBluffCall,
  applyBluffResult,
  applyDeal,
  collectPile,
  createInitialState,
  lastPlay,
  startNewRound,
  transitionToPlaying,
  applyPlay,
} from '../core/state.js';
import type { Card, GameState, Play, PlayMode, Rank } from '../core/types.js';

export type EngineEvent =
  | { type: 'state'; state: GameState }
  | { type: 'reveal'; lastPlay: Play; verdict: 'liar' | 'truth'; pickupPlayerId: string }
  | { type: 'error'; playerId: string; message: string };

export class GameEngine {
  private state: GameState;
  private listeners: Array<(event: EngineEvent) => void> = [];
  private potentialWinnerId: string | null = null;

  constructor(hostId: string, hostName: string, playMode: PlayMode = 'loud') {
    const host = { id: hostId, name: hostName, cardCount: 0, isConnected: true };
    this.state = createInitialState([host], playMode);
  }

  on(listener: (event: EngineEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  getState(): GameState {
    return this.state;
  }

  addPlayer(id: string, name: string): void {
    if (this.state.phase !== 'lobby') {
      this.emit({ type: 'error', playerId: id, message: 'Cannot add player outside of lobby.' });
      return;
    }
    if (this.state.players.length >= 6) {
      this.emit({ type: 'error', playerId: id, message: 'Game is full (max 6 players).' });
      return;
    }
    const player = { id, name, cardCount: 0, isConnected: true };
    this.state = {
      ...this.state,
      players: [...this.state.players, player],
      hands: { ...this.state.hands, [id]: [] },
    };
    this.push();
  }

  removePlayer(id: string): void {
    if (this.state.phase === 'lobby') {
      this.state = {
        ...this.state,
        players: this.state.players.filter(p => p.id !== id),
        hands: Object.fromEntries(Object.entries(this.state.hands).filter(([k]) => k !== id)),
      };
    } else {
      this.state = {
        ...this.state,
        players: this.state.players.map(p =>
          p.id === id ? { ...p, isConnected: false } : p,
        ),
      };
    }
    this.push();
  }

  setPlayMode(mode: PlayMode): void {
    if (this.state.phase !== 'lobby') {
      return;
    }
    this.state = { ...this.state, playMode: mode };
    this.push();
  }

  startGame(): void {
    if (this.state.phase !== 'lobby') {
      return;
    }
    if (this.state.players.length < 2) {
      return;
    }
    const deck = shuffle(buildDeck());
    const hands = deal(deck, this.state.players.length);
    const handsByPlayerId: Record<string, Card[]> = {};
    for (let i = 0; i < this.state.players.length; i++) {
      handsByPlayerId[this.state.players[i]!.id] = hands[i]!;
    }
    this.state = applyDeal(this.state, handsByPlayerId);
    this.state = transitionToPlaying(this.state, this.state.players[0]!.id);
    this.push();
  }

  playCards(playerId: string, cardIds: string[], claimedRank: Rank): void {
    if (this.state.phase !== 'playing') {
      this.emit({ type: 'error', playerId, message: 'Not in playing phase.' });
      return;
    }

    // A potential winner exists — the next player played instead of calling bluff,
    // so the potential winner is confirmed as the actual winner.
    if (this.potentialWinnerId !== null) {
      this.state = { ...this.state, phase: 'ended', winnerId: this.potentialWinnerId };
      this.potentialWinnerId = null;
      this.push();
      return;
    }

    const round = this.state.currentRound!;
    if (playerId !== round.activePlayerId) {
      this.emit({ type: 'error', playerId, message: 'It is not your turn.' });
      return;
    }

    const hand = this.state.hands[playerId] ?? [];
    const result = validatePlay(cardIds, claimedRank, hand, round);
    if (!result.valid) {
      this.emit({ type: 'error', playerId, message: result.error ?? 'Invalid play.' });
      return;
    }

    const cardMap = new Map(hand.map(c => [c.id, c]));
    const cards: Card[] = cardIds.map(id => cardMap.get(id)!);

    const play: Play = {
      playerId,
      cards,
      claimedRank,
      claimedCount: cards.length,
      timestamp: Date.now(),
    };

    this.state = applyPlay(this.state, play);

    if (this.state.hands[playerId]!.length === 0) {
      this.potentialWinnerId = playerId;
    }

    this.push();
  }

  callBluff(callerId: string): void {
    if (this.state.phase !== 'playing') {
      this.emit({ type: 'error', playerId: callerId, message: 'Not in playing phase.' });
      return;
    }

    const round = this.state.currentRound!;
    if (callerId !== round.activePlayerId) {
      this.emit({ type: 'error', playerId: callerId, message: 'It is not your turn to call.' });
      return;
    }

    if (round.plays.length === 0) {
      this.emit({ type: 'error', playerId: callerId, message: 'No play to call bluff on.' });
      return;
    }

    const last = lastPlay(this.state)!;
    this.state = applyBluffCall(this.state);

    const verdict = resolveBluff(last);
    const pickupPlayerId = verdict === 'liar' ? last.playerId : callerId;

    this.push();
    this.emit({ type: 'reveal', lastPlay: last, verdict, pickupPlayerId });
  }

  confirmPickup(pickupPlayerId: string): void {
    if (this.state.phase !== 'revealing') {
      return;
    }

    const pileCards = collectPile(this.state);
    this.state = applyBluffResult(this.state, pickupPlayerId, pileCards);

    if (this.potentialWinnerId !== null) {
      if (this.potentialWinnerId !== pickupPlayerId) {
        // The potential winner told the truth; the caller picks up. Winner confirmed.
        this.state = { ...this.state, phase: 'ended', winnerId: this.potentialWinnerId };
      }
      // If potentialWinnerId === pickupPlayerId, they lied and pick up cards. Game continues.
      this.potentialWinnerId = null;
    }

    this.push();
  }

  startNextRound(startPlayerId: string): void {
    if (this.state.phase !== 'pickup') {
      return;
    }
    this.state = startNewRound(this.state, startPlayerId);
    this.push();
  }

  private push(): void {
    this.emit({ type: 'state', state: this.state });
  }

  private emit(event: EngineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
