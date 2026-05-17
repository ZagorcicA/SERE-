import type { Rank } from '../core/types.js';

export interface RankPickerOptions {
  /** Ranks the player actually holds — shown with a dot indicator. */
  hintsFor?: Rank[];
  /** If set, only this rank is selectable (confirm mode for Silent follow-ups). */
  lockedRank?: Rank;
  onSelect: (rank: Rank) => void;
  onCancel: () => void;
}

const RANK_ORDER: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/**
 * Shows a modal rank-picker overlay.
 * Returns a cleanup/close function.
 */
export function showRankPicker(options: RankPickerOptions): () => void {
  const { hintsFor = [], lockedRank, onSelect, onCancel } = options;
  const hintSet = new Set<Rank>(hintsFor);

  const overlay = document.createElement('div');
  overlay.className = 'rank-picker-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'rank-picker-dialog';

  // Title
  const title = document.createElement('h2');
  title.className = 'rank-picker-title';
  title.textContent = lockedRank ? 'Potvrdi rang:' : 'Koji rang?';
  dialog.appendChild(title);

  // 4-column grid
  const grid = document.createElement('div');
  grid.className = 'rank-grid';

  for (const rank of RANK_ORDER) {
    const btn = document.createElement('button');
    btn.className = 'rank-btn';
    btn.dataset['rank'] = rank;
    btn.textContent = rank;

    if (hintSet.has(rank)) {
      btn.classList.add('has-hint');
    }

    if (lockedRank !== undefined && rank !== lockedRank) {
      btn.disabled = true;
      btn.classList.add('locked-out');
    }

    btn.addEventListener('click', () => {
      close();
      onSelect(rank);
    });

    grid.appendChild(btn);
  }

  dialog.appendChild(grid);

  // Cancel button
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'rank-cancel-btn';
  cancelBtn.textContent = 'Odustani';
  cancelBtn.addEventListener('click', () => {
    close();
    onCancel();
  });
  dialog.appendChild(cancelBtn);

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      close();
      onCancel();
    }
  });

  // Animate in
  requestAnimationFrame(() => overlay.classList.add('visible'));

  function close(): void {
    overlay.classList.remove('visible');
    setTimeout(() => overlay.remove(), 200);
  }

  return close;
}
