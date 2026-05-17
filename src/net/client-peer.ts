import Peer from 'peerjs';
import type { DataConnection } from 'peerjs';
import type { ClientGameState, Play } from '../core/types.js';
import type { ClientIntent, HostMessage } from './messages.js';

export type RevealPayload = {
  lastPlay: Play;
  verdict: 'liar' | 'truth';
  pickupPlayerId: string;
};

export class ClientPeer {
  private peer: Peer;
  private conn: DataConnection | null = null;

  private onConnectedCb?: () => void;
  private onStateCb?: (state: ClientGameState) => void;
  private onRevealCb?: (payload: RevealPayload) => void;
  private onErrorCb?: (message: string) => void;
  private onDisconnectedCb?: () => void;
  private myId: string | null = null;

  constructor(private readonly roomId: string) {
    // Use a random peer ID for the client
    this.peer = new Peer();
    this.peer.on('open', () => this.connectToHost());
    this.peer.on('error', err => this.onErrorCb?.((err as Error).message));
  }

  // Fluent event subscription methods
  onConnected(cb: () => void): this { this.onConnectedCb = cb; return this; }
  onStateUpdate(cb: (state: ClientGameState) => void): this { this.onStateCb = cb; return this; }
  onReveal(cb: (payload: RevealPayload) => void): this { this.onRevealCb = cb; return this; }
  onNetworkError(cb: (message: string) => void): this { this.onErrorCb = cb; return this; }
  onDisconnected(cb: () => void): this { this.onDisconnectedCb = cb; return this; }

  getMyId(): string | null { return this.myId; }

  send(intent: ClientIntent): void {
    this.conn?.send(intent);
  }

  join(name: string): void {
    this.send({ type: 'JOIN', name });
  }

  destroy(): void {
    this.peer.destroy();
  }

  private connectToHost(): void {
    this.conn = this.peer.connect(this.roomId, { reliable: true });

    this.conn.on('open', () => this.onConnectedCb?.());

    this.conn.on('data', data => this.handleMessage(data as HostMessage));

    this.conn.on('close', () => {
      this.onDisconnectedCb?.();
      // Attempt reconnect after 2s
      setTimeout(() => this.connectToHost(), 2000);
    });

    this.conn.on('error', err => {
      this.onErrorCb?.((err as Error).message);
    });
  }

  private handleMessage(msg: HostMessage): void {
    switch (msg.type) {
      case 'WELCOME':
        this.myId = msg.yourId;
        break;
      case 'STATE':
        this.onStateCb?.(msg.state);
        break;
      case 'REVEAL':
        this.onRevealCb?.({ lastPlay: msg.lastPlay, verdict: msg.verdict, pickupPlayerId: msg.pickupPlayerId });
        break;
      case 'ERROR':
        this.onErrorCb?.(msg.message);
        break;
      case 'PONG':
        break;
      case 'PLAYER_LEFT':
        break;
    }
  }
}
