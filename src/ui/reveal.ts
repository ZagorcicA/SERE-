import type { Card, Play, Player } from '../core/types.js';
import { animateReveal } from './animations.js';

export interface RevealOptions {
  lastPlay: Play;
  verdict: 'liar' | 'truth';
  pickupPlayerId: string;
  players: Player[];
  onDismiss: () => void;
}

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

function playerName(players: Player[], id: string): string {
  return players.find(p => p.id === id)?.name ?? id;
}

function buildCardEl(card: Card): HTMLElement {
  const el = document.createElement('div');
  el.className = `card reveal-card ${suitClass(card)}`;
  el.innerHTML = `
    <span class="card-rank">${card.rank}</span>
    <span class="card-suit">${suitSymbol(card)}</span>
  `;
  el.classList.add('face-down');
  return el;
}

export function showReveal(options: RevealOptions): void {
  const { lastPlay, verdict, pickupPlayerId, players, onDismiss } = options;

  // Remove any stale overlays from previous rounds
  document.querySelectorAll('.reveal-overlay').forEach(el => el.remove());

  const overlay = document.createElement('div');
  overlay.className = 'reveal-overlay';

  const inner = document.createElement('div');
  inner.className = 'reveal-inner';

  // Cards row
  const cardsRow = document.createElement('div');
  cardsRow.className = 'reveal-cards';
  const cardEls: HTMLElement[] = [];
  for (const card of lastPlay.cards) {
    const el = buildCardEl(card);
    cardsRow.appendChild(el);
    cardEls.push(el);
  }
  inner.appendChild(cardsRow);

  // Verdict
  const verdictEl = document.createElement('div');
  verdictEl.className = 'reveal-verdict';
  const claimerName = playerName(players, lastPlay.playerId);
  if (verdict === 'liar') {
    verdictEl.innerHTML = `SEREŠ! 🤥<br><span class="reveal-verdict-sub">${claimerName} laže!</span>`;
    verdictEl.classList.add('verdict-liar');
  } else {
    verdictEl.innerHTML = `Istina! ✓<br><span class="reveal-verdict-sub">${claimerName} je bio iskren!</span>`;
    verdictEl.classList.add('verdict-truth');
  }
  inner.appendChild(verdictEl);

  // Pickup label
  const pickupName = playerName(players, pickupPlayerId);
  const pickupEl = document.createElement('p');
  pickupEl.className = 'reveal-pickup-text';
  pickupEl.textContent = `${pickupName} skuplja sve karte.`;
  inner.appendChild(pickupEl);

  overlay.appendChild(inner);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('visible'));

  // Flip cards then auto-advance — no button needed
  (async () => {
    for (const el of cardEls) {
      await new Promise<void>(r => setTimeout(r, 150));
      el.classList.remove('face-down');
      await animateReveal(el);
    }
    await new Promise<void>(r => setTimeout(r, 1500));
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.remove();
      onDismiss();
    }, 200);
  })();
}
