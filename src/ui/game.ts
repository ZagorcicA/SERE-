import type { GameEngine, EngineEvent } from '../host/engine.js';
import type { Card, GameState, Rank } from '../core/types.js';
import { showRankPicker } from './rank-picker.js';
import { showReveal } from './reveal.js';
import { shake } from './animations.js';

// ── Card element helper ────────────────────────────────────────────────────────

function suitSymbol(card: Card): string {
  if (card.suit === null) return '★';
  const map: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
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

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(message: string): void {
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

// ── Main renderer ─────────────────────────────────────────────────────────────

export function renderGame(container: HTMLElement, engine: GameEngine): void {
  let selectedIds = new Set<string>();
  let lastActivePlayerId: string | null = null;

  function render(state: GameState): void {
    const round = state.currentRound;
    const activeId = round?.activePlayerId ?? null;

    // Reset selection when the active player changes
    if (activeId !== lastActivePlayerId) {
      selectedIds = new Set();
      lastActivePlayerId = activeId;
    }

    // ── Win screen ────────────────────────────────────────────────────────────
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
      newGameBtn.addEventListener('click', () => location.reload());
      win.appendChild(newGameBtn);

      container.appendChild(win);
      return;
    }

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'game';

    // ── Turn banner ───────────────────────────────────────────────────────────
    const activeName = state.players.find(p => p.id === activeId)?.name ?? '...';
    const banner = document.createElement('div');
    banner.className = 'turn-banner';
    banner.textContent = `Tvoj red, ${activeName}!`;
    root.appendChild(banner);

    // ── Opponents row ─────────────────────────────────────────────────────────
    const opponentsRow = document.createElement('div');
    opponentsRow.className = 'opponents';

    for (const player of state.players) {
      if (player.id === activeId) continue;
      const chip = document.createElement('div');
      chip.className = `opponent-chip${!player.isConnected ? ' disconnected' : ''}`;
      chip.innerHTML = `
        <span class="opponent-name">${player.name}</span>
        <span class="opponent-count">${player.cardCount}</span>
      `;
      opponentsRow.appendChild(chip);
    }
    root.appendChild(opponentsRow);

    // ── Pile area ─────────────────────────────────────────────────────────────
    const pileArea = document.createElement('div');
    pileArea.className = 'pile-area';

    const totalPile = round
      ? round.plays.reduce((sum, p) => sum + p.cards.length, 0)
      : 0;

    pileArea.innerHTML = `
      <div class="pile-icon">🂠</div>
      <div class="pile-count">Hrpa: ${totalPile} karat${totalPile === 1 ? 'a' : totalPile < 5 ? 'e' : 'a'}</div>
    `;
    root.appendChild(pileArea);

    // ── Claim info strip ──────────────────────────────────────────────────────
    if (round) {
      const claimInfo = document.createElement('div');
      claimInfo.className = 'claim-info';

      const lastPlayEntry = round.plays.at(-1);
      if (lastPlayEntry) {
        const claimer = state.players.find(p => p.id === lastPlayEntry.playerId);
        claimInfo.textContent =
          `Rang: ${round.lockedRank} | Zadnja igra: ${claimer?.name ?? '?'} → ${lastPlayEntry.claimedCount} × ${lastPlayEntry.claimedRank}`;
      } else {
        claimInfo.textContent = `Rang: nije određen — prvi igrač otvara rundu`;
      }
      root.appendChild(claimInfo);
    }

    // ── Silent mode claim feed ────────────────────────────────────────────────
    if (state.playMode === 'silent' && round && round.plays.length > 0) {
      const feed = document.createElement('div');
      feed.className = 'claim-feed';
      for (const play of [...round.plays].reverse()) {
        const player = state.players.find(p => p.id === play.playerId);
        const entry = document.createElement('div');
        entry.className = 'claim-feed-entry';
        entry.textContent = `${player?.name ?? '?'}: ${play.claimedCount} × ${play.claimedRank}`;
        feed.appendChild(entry);
      }
      root.appendChild(feed);
    }

    // ── All hands (hotseat: all visible) ─────────────────────────────────────
    const handsSection = document.createElement('div');
    handsSection.className = 'hands-section';

    for (const player of state.players) {
      const hand = state.hands[player.id] ?? [];
      const isActive = player.id === activeId;

      const handWrapper = document.createElement('div');
      handWrapper.className = `hand-wrapper${isActive ? ' active-hand' : ''}`;

      const handLabel = document.createElement('div');
      handLabel.className = 'hand-label';
      handLabel.textContent = player.name;
      handWrapper.appendChild(handLabel);

      const handRow = document.createElement('div');
      handRow.className = 'hand';

      for (const card of hand) {
        const isSelected = selectedIds.has(card.id);
        const el = cardEl(card, isSelected);

        if (isActive && state.phase === 'playing') {
          el.classList.add('interactive');
          el.addEventListener('click', () => {
            if (selectedIds.has(card.id)) {
              selectedIds.delete(card.id);
            } else {
              selectedIds.add(card.id);
            }
            // Re-render to update button states without full reset
            render(state);
          });
        }

        handRow.appendChild(el);
      }

      handWrapper.appendChild(handRow);
      handsSection.appendChild(handWrapper);
    }

    root.appendChild(handsSection);

    // ── Action buttons ────────────────────────────────────────────────────────
    if (state.phase === 'playing' && round) {
      const actions = document.createElement('div');
      actions.className = 'actions';

      const isStarter = round.plays.length === 0;
      const hasSelection = selectedIds.size > 0;
      const activeHand = state.hands[activeId ?? ''] ?? [];
      const ranksInHand = [...new Set(activeHand.map(c => c.rank))] as Rank[];

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
            lockedRank: !isStarter && state.playMode === 'silent' ? round.lockedRank : undefined,
            onSelect: (rank: Rank) => {
              selectedIds = new Set();
              engine.playCards(activeId!, cardIds, rank);
            },
            onCancel: () => {},
          });
        } else {
          // Loud follow-up: rank is locked
          selectedIds = new Set();
          engine.playCards(activeId!, cardIds, round.lockedRank);
        }
      });

      actions.appendChild(playBtn);

      // SEREŠ? button
      const callBtn = document.createElement('button');
      callBtn.className = 'btn-call';
      callBtn.textContent = 'SEREŠ?';
      callBtn.disabled = isStarter; // No plays yet → cannot call
      callBtn.addEventListener('click', () => {
        engine.callBluff(activeId!);
      });

      actions.appendChild(callBtn);
      root.appendChild(actions);
    }

    container.appendChild(root);
  }

  // Initial render
  render(engine.getState());

  // Engine event handler
  const unsub = engine.on((event: EngineEvent) => {
    if (event.type === 'state') {
      render(event.state);
    } else if (event.type === 'reveal') {
      const state = engine.getState();
      showReveal({
        lastPlay: event.lastPlay,
        verdict: event.verdict,
        pickupPlayerId: event.pickupPlayerId,
        players: state.players,
        onDismiss: () => {
          engine.confirmPickup(event.pickupPlayerId);
          engine.startNextRound(event.pickupPlayerId);
        },
      });
    } else if (event.type === 'error') {
      showToast(event.message);
      // Shake the action buttons if available
      const actionsEl = container.querySelector('.actions') as HTMLElement | null;
      if (actionsEl) shake(actionsEl);
    }
  });

  // Cleanup listener when container is detached
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      unsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
