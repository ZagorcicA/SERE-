import type { Card, ClientGameState, Rank } from '../core/types.js';
import { showRankPicker } from './rank-picker.js';
import { shake } from './animations.js';

// ── Action interface ───────────────────────────────────────────────────────────

export interface GameActions {
  playCards(cardIds: string[], claimedRank: Rank): void;
  callBluff(): void;
  confirmPickup(): void;
  startNextRound(): void;
}

// ── Module-level selection state ───────────────────────────────────────────────

let selectedIds = new Set<string>();
let lastActivePlayerId: string | null = null;

// ── Card element helpers ───────────────────────────────────────────────────────

function suitSymbol(card: Card): string {
  if (card.suit === null) return '★';
  const map: Record<string, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠',
  };
  return map[card.suit] ?? '';
}

function suitClass(card: Card): string {
  if (card.suit === null) return 'joker';
  return card.suit;
}

function cardEl(card: Card, selected: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = `card ${suitClass(card)}${selected ? ' selected' : ''}`;
  el.dataset['cardId'] = card.id;
  el.innerHTML = `
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit">${suitSymbol(card)}</span>
  `;
  return el;
}

// ── Toast ──────────────────────────────────────────────────────────────────────

export function showToast(message: string): void {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Renders the complete game view for the current state.
 *
 * Does NOT subscribe to events — the caller calls this again with new state
 * when state changes. Selection state persists across re-renders but resets
 * when the active player changes.
 *
 * @param container   The root element to render into.
 * @param state       Client-safe game state (redacted for networked play).
 * @param actions     Callbacks for player actions.
 * @param pickupPlayerId  The player who must pick up the pile (set when
 *                        phase === 'pickup', derived from the REVEAL event).
 */
export function renderNetworkedGame(
  container: HTMLElement,
  state: ClientGameState,
  actions: GameActions,
  pickupPlayerId?: string,
): void {
  const round = state.currentRound;
  const activeId = round?.activePlayerId ?? null;
  const isMyTurn = state.myId === activeId;

  // Reset selection when the active player changes
  if (activeId !== lastActivePlayerId) {
    selectedIds = new Set();
    lastActivePlayerId = activeId;
  }

  // ── Win screen ──────────────────────────────────────────────────────────────
  if (state.phase === 'ended') {
    container.innerHTML = '';
    const win = document.createElement('div');
    win.className = 'win-screen';

    const winnerName = state.players.find(p => p.id === state.winnerId)?.name ?? '???';
    const banner = document.createElement('div');
    banner.className = 'win-banner';
    banner.textContent = `${winnerName} pobjeđuje! 🎉`;
    win.appendChild(banner);

    const newGameBtn = document.createElement('button');
    newGameBtn.className = 'btn-new-game';
    newGameBtn.textContent = 'Nova igra';
    newGameBtn.addEventListener('click', () => {
      window.location.href = window.location.origin + window.location.pathname;
    });
    win.appendChild(newGameBtn);

    container.appendChild(win);
    return;
  }

  // ── Pickup screen ───────────────────────────────────────────────────────────
  if (state.phase === 'pickup') {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'game';

    const pickupSection = document.createElement('div');
    pickupSection.className = 'pickup-section';

    const pickupLabel = document.createElement('p');
    pickupLabel.className = 'pickup-label';

    const amPickupPlayer = pickupPlayerId !== undefined && state.myId === pickupPlayerId;

    if (amPickupPlayer) {
      pickupLabel.textContent = 'Skupi karte i počni novu rundu.';
      pickupSection.appendChild(pickupLabel);

      const continueBtn = document.createElement('button');
      continueBtn.className = 'btn-continue';
      continueBtn.textContent = 'Nastavi';
      continueBtn.addEventListener('click', () => {
        actions.startNextRound();
      });
      pickupSection.appendChild(continueBtn);
    } else {
      const pickerName =
        pickupPlayerId !== undefined
          ? (state.players.find(p => p.id === pickupPlayerId)?.name ?? '...')
          : '...';
      pickupLabel.textContent = `Čekaj... ${pickerName} skuplja karte.`;
      pickupSection.appendChild(pickupLabel);
    }

    root.appendChild(pickupSection);
    container.appendChild(root);
    return;
  }

  // ── Normal game screen ──────────────────────────────────────────────────────
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'game';

  // ── Turn banner ─────────────────────────────────────────────────────────────
  const activeName = state.players.find(p => p.id === activeId)?.name ?? '...';
  const banner = document.createElement('div');
  banner.className = 'turn-banner';

  if (isMyTurn) {
    banner.textContent = `Tvoj red, ${activeName}!`;
  } else {
    banner.textContent = `Red igrača ${activeName}`;
  }

  root.appendChild(banner);

  // ── Opponents row ───────────────────────────────────────────────────────────
  const opponentsRow = document.createElement('div');
  opponentsRow.className = 'opponents';

  for (const player of state.players) {
    if (player.id === state.myId) continue;
    const isActiveOpponent = player.id === activeId;
    const chip = document.createElement('div');
    chip.className = `opponent-chip${!player.isConnected ? ' disconnected' : ''}${isActiveOpponent ? ' active-opponent' : ''}`;
    chip.innerHTML = `
      <span class="opponent-name">${player.name}</span>
      <span class="opponent-count">${player.cardCount}</span>
    `;
    opponentsRow.appendChild(chip);
  }

  root.appendChild(opponentsRow);

  // ── Pile area ───────────────────────────────────────────────────────────────
  const pileArea = document.createElement('div');
  pileArea.className = 'pile-area';

  const totalPile = round?.totalPileCount ?? 0;
  const pileWord = totalPile === 1 ? 'karta' : totalPile >= 2 && totalPile <= 4 ? 'karte' : 'karata';

  pileArea.innerHTML = `
    <div class="pile-icon">🂠</div>
    <div class="pile-count">Hrpa: ${totalPile} ${pileWord}</div>
  `;
  root.appendChild(pileArea);

  // ── Claim info strip ────────────────────────────────────────────────────────
  if (round !== null) {
    const claimInfo = document.createElement('div');
    claimInfo.className = 'claim-info';

    if (round.claimChain.length > 0) {
      const last = round.claimChain[round.claimChain.length - 1]!;
      claimInfo.textContent =
        `Rang: ${round.lockedRank} | Zadnja igra: ${last.playerName} → ${last.claimedCount} × ${last.claimedRank}`;
    } else {
      claimInfo.textContent = 'Novi krug — odaberi karte i otvori rundu';
    }

    root.appendChild(claimInfo);
  }

  // ── Silent mode claim feed ──────────────────────────────────────────────────
  if (state.playMode === 'silent' && round !== null && round.claimChain.length > 0) {
    const feed = document.createElement('div');
    feed.className = 'claim-feed';

    for (const claim of [...round.claimChain].reverse()) {
      const entry = document.createElement('div');
      entry.className = 'claim-feed-entry';
      entry.textContent = `${claim.playerName}: ${claim.claimedCount} × ${claim.claimedRank}`;
      feed.appendChild(entry);
    }

    root.appendChild(feed);
  }

  // ── My hand ─────────────────────────────────────────────────────────────────
  const handWrapper = document.createElement('div');
  handWrapper.className = `hand-wrapper${isMyTurn ? ' active-hand' : ''}`;

  const handLabel = document.createElement('div');
  handLabel.className = 'hand-label';
  handLabel.textContent = state.players.find(p => p.id === state.myId)?.name ?? 'Moje karte';
  handWrapper.appendChild(handLabel);

  const handRow = document.createElement('div');
  handRow.className = 'hand';

  for (const card of state.myHand) {
    const isSelected = selectedIds.has(card.id);
    const el = cardEl(card, isSelected);

    if (isMyTurn && state.phase === 'playing') {
      el.classList.add('interactive');
      el.addEventListener('click', () => {
        if (selectedIds.has(card.id)) {
          selectedIds.delete(card.id);
        } else {
          selectedIds.add(card.id);
        }
        // Re-render to update button states without full reset
        renderNetworkedGame(container, state, actions, pickupPlayerId);
      });
    }

    handRow.appendChild(el);
  }

  handWrapper.appendChild(handRow);
  root.appendChild(handWrapper);

  // ── Action buttons (only when it's my turn and phase is playing) ────────────
  if (state.phase === 'playing' && round !== null && isMyTurn) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'actions';

    const isStarter = round.claimChain.length === 0;
    const hasSelection = selectedIds.size > 0;
    const ranksInHand = [...new Set(state.myHand.map(c => c.rank))] as Rank[];

    // Play button
    const playBtn = document.createElement('button');
    playBtn.className = 'btn-play';
    playBtn.textContent = 'Igraj';
    playBtn.disabled = !hasSelection;

    playBtn.addEventListener('click', () => {
      const cardIds = [...selectedIds];
      if (cardIds.length === 0) return;

      const needsPicker = isStarter || state.playMode === 'silent';

      if (needsPicker) {
        showRankPicker({
          hintsFor: ranksInHand,
          // In a silent follow-up the rank is pre-set; picker becomes confirm-only
          lockedRank: !isStarter && state.playMode === 'silent' ? round.lockedRank : undefined,
          onSelect: (rank: Rank) => {
            selectedIds = new Set();
            actions.playCards(cardIds, rank);
          },
          onCancel: () => {},
        });
      } else {
        // Loud follow-up: rank is already locked for the round
        selectedIds = new Set();
        actions.playCards(cardIds, round.lockedRank);
      }
    });

    actionsDiv.appendChild(playBtn);

    // SEREŠ? button
    const callBtn = document.createElement('button');
    callBtn.className = 'btn-call';
    callBtn.textContent = 'SEREŠ?';
    callBtn.disabled = isStarter; // Cannot call before any plays this round

    callBtn.addEventListener('click', () => {
      actions.callBluff();
    });

    actionsDiv.appendChild(callBtn);

    // Shake helper for external error feedback
    actionsDiv.dataset['actionsEl'] = 'true';
    root.appendChild(actionsDiv);
  }

  container.appendChild(root);
}

// ── Shake helper re-export ─────────────────────────────────────────────────────
// Lets callers shake the action buttons on network errors without importing
// animations directly.
export function shakeActions(container: HTMLElement): void {
  const actionsEl = container.querySelector('.actions') as HTMLElement | null;
  if (actionsEl) shake(actionsEl);
}
