import './styles/base.css';
import './styles/lobby.css';
import './styles/game.css';
import { GameEngine } from './host/engine.js';
import { HostPeer } from './net/host-peer.js';
import { ClientPeer } from './net/client-peer.js';
import { redact } from './host/redactor.js';
import { renderHostLobby, renderClientJoin, renderClientWaiting } from './ui/lobby.js';
import { renderNetworkedGame, type GameActions, showToast } from './ui/networked-game.js';
import { showReveal } from './ui/reveal.js';
import type { ClientGameState } from './core/types.js';

const app = document.getElementById('app')!;
const params = new URLSearchParams(window.location.search);
const roomParam = params.get('room');

if (roomParam) {
  startClientRole(roomParam);
} else {
  startHostRole();
}

function startHostRole(): void {
  const engine = new GameEngine('host', 'Domaćin', 'loud');
  let stopLobby: (() => void) | null = null;

  app.innerHTML = '<div class="connecting"><p>Spajanje...</p></div>';

  const hostPeer = new HostPeer(engine)
    .onRoomReady(roomId => {
      stopLobby = renderHostLobby(app, engine, roomId);
    })
    .onError(err => {
      app.innerHTML = `<div class="error-screen"><p>Greška: ${err.message}</p><button onclick="location.reload()">Pokušaj ponovo</button></div>`;
    });

  const actions: GameActions = {
    playCards: (cardIds, rank) => engine.playCards('host', cardIds, rank),
    callBluff: () => engine.callBluff('host'),
  };

  engine.on(event => {
    if (event.type === 'state') {
      const { state } = event;
      if (state.phase !== 'lobby') {
        stopLobby?.();
        stopLobby = null;
        const clientState = redact(state, 'host');
        renderNetworkedGame(app, clientState, actions);
      }
    } else if (event.type === 'reveal') {
      const isHostPickup = event.pickupPlayerId === 'host';
      showReveal({
        lastPlay: event.lastPlay,
        verdict: event.verdict,
        pickupPlayerId: event.pickupPlayerId,
        players: engine.getState().players,
        onDismiss: () => {
          if (isHostPickup) {
            engine.confirmPickup('host');
            engine.startNextRound('host');
          }
        },
      });
    } else if (event.type === 'error') {
      showToast(event.message);
    }
  });

  // Suppress unused variable warning — hostPeer kept alive for peer lifecycle
  void hostPeer;
}

function startClientRole(roomId: string): void {
  let latestState: ClientGameState | null = null;
  let hasJoined = false;

  app.innerHTML = '<div class="connecting"><p>Spajanje na sobu...</p></div>';

  const client = new ClientPeer(roomId);

  const actions: GameActions = {
    playCards: (cardIds, rank) => client.send({ type: 'PLAY_CARDS', cardIds, claimedRank: rank }),
    callBluff: () => client.send({ type: 'CALL_BLUFF' }),
  };

  client
    .onConnected(() => {
      if (!hasJoined) renderClientJoin(app, name => { hasJoined = true; client.join(name); });
    })
    .onStateUpdate(state => {
      latestState = state;
      if (state.phase === 'lobby') {
        renderClientWaiting(app, state.players);
      } else {
        renderNetworkedGame(app, state, actions);
      }
    })
    .onReveal(payload => {
      if (latestState) {
        const isPickup = client.getMyId() === payload.pickupPlayerId;
        showReveal({
          lastPlay: payload.lastPlay,
          verdict: payload.verdict,
          pickupPlayerId: payload.pickupPlayerId,
          players: latestState.players,
          onDismiss: () => {
            if (isPickup) {
              client.send({ type: 'CONFIRM_PICKUP' });
              client.send({ type: 'START_NEXT_ROUND' });
            }
          },
        });
      }
    })
    .onNetworkError(msg => showToast(msg))
    .onDisconnected(() => showToast('Veza prekinuta — pokušavam ponovo...'));
}
