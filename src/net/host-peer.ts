import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { GameEngine, EngineEvent } from '../host/engine.js';
import type { GameState } from '../core/types.js';
import { redact } from '../host/redactor.js';
import type { ClientIntent, HostMessage } from './messages.js';

export class HostPeer {
  private peer: Peer;
  private connections = new Map<string, DataConnection>();
  private onRoomReadyCb?: (roomId: string) => void;
  private onErrorCb?: (err: Error) => void;
  // Tracks who should confirm pickup so rogue CONFIRM_PICKUP intents are ignored
  private pendingPickupPlayerId: string | null = null;

  constructor(private readonly engine: GameEngine) {
    this.peer = new Peer();

    this.peer.on('open', id => this.onRoomReadyCb?.(id));
    this.peer.on('error', err => this.onErrorCb?.(err as Error));
    this.peer.on('connection', conn => this.handleConnection(conn));

    engine.on(event => this.handleEngineEvent(event));
  }

  onRoomReady(cb: (roomId: string) => void): this {
    this.onRoomReadyCb = cb;
    return this;
  }

  onError(cb: (err: Error) => void): this {
    this.onErrorCb = cb;
    return this;
  }

  destroy(): void {
    this.peer.destroy();
  }

  private handleConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      // Send current lobby state as preview (player list / mode)
      const current = this.engine.getState();
      if (current.phase === 'lobby') {
        const welcome: HostMessage = { type: 'WELCOME', yourId: conn.peer };
        conn.send(welcome);
      }
    });

    conn.on('data', data => this.handleIntent(conn.peer, data as ClientIntent));

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      this.engine.removePlayer(conn.peer);
    });

    conn.on('error', () => {
      this.connections.delete(conn.peer);
      this.engine.removePlayer(conn.peer);
    });
  }

  private handleIntent(peerId: string, intent: ClientIntent): void {
    switch (intent.type) {
      case 'JOIN':
        this.engine.addPlayer(peerId, intent.name);
        break;
      case 'PLAY_CARDS':
        this.engine.playCards(peerId, intent.cardIds, intent.claimedRank);
        break;
      case 'CALL_BLUFF':
        this.engine.callBluff(peerId);
        break;
      case 'CONFIRM_PICKUP':
        if (peerId === this.pendingPickupPlayerId) {
          this.engine.confirmPickup(peerId);
        }
        break;
      case 'START_NEXT_ROUND':
        if (peerId === this.pendingPickupPlayerId) {
          this.pendingPickupPlayerId = null;
          this.engine.startNextRound(peerId);
        }
        break;
      case 'PING':
        this.send(peerId, { type: 'PONG' });
        break;
    }
  }

  private handleEngineEvent(event: EngineEvent): void {
    if (event.type === 'state') {
      this.broadcastState(event.state);
      // Clear pickup tracking once a new round starts
      if (event.state.phase === 'playing' && this.pendingPickupPlayerId !== null) {
        this.pendingPickupPlayerId = null;
      }
    } else if (event.type === 'reveal') {
      this.pendingPickupPlayerId = event.pickupPlayerId;
      const msg: HostMessage = {
        type: 'REVEAL',
        lastPlay: event.lastPlay,
        verdict: event.verdict,
        pickupPlayerId: event.pickupPlayerId,
      };
      this.broadcast(msg);
    } else if (event.type === 'error') {
      this.send(event.playerId, { type: 'ERROR', message: event.message });
    }
  }

  private broadcastState(state: GameState): void {
    for (const [peerId, conn] of this.connections) {
      const clientState = redact(state, peerId);
      const msg: HostMessage = { type: 'STATE', state: clientState };
      conn.send(msg);
    }
  }

  private broadcast(msg: HostMessage): void {
    for (const conn of this.connections.values()) {
      conn.send(msg);
    }
  }

  private send(peerId: string, msg: HostMessage): void {
    this.connections.get(peerId)?.send(msg);
  }
}
