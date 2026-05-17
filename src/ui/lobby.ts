import QRCode from 'qrcode';
import type { GameEngine } from '../host/engine.js';
import type { GameState, Player } from '../core/types.js';

/**
 * Renders the lobby screen into `container`.
 * Subscribes to engine state events and re-renders on change.
 */
export function renderLobby(container: HTMLElement, engine: GameEngine): void {
  let playerCounter = 1; // p0 is the host, new ones start at p1

  function render(state: GameState): void {
    container.innerHTML = '';

    const root = document.createElement('div');
    root.className = 'lobby';

    // Title
    const title = document.createElement('h1');
    title.className = 'lobby-title';
    title.textContent = 'SEREŠ?';
    root.appendChild(title);

    // Subtitle
    const subtitle = document.createElement('p');
    subtitle.className = 'lobby-subtitle';
    subtitle.textContent = 'Dodaj igrače i počni igru';
    root.appendChild(subtitle);

    // Add player form
    const form = document.createElement('form');
    form.className = 'player-form';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'Ime igrača';
    nameInput.maxLength = 20;
    nameInput.autocomplete = 'off';
    nameInput.autocapitalize = 'words';
    form.appendChild(nameInput);

    const addBtn = document.createElement('button');
    addBtn.type = 'submit';
    addBtn.textContent = 'Dodaj';
    addBtn.disabled = state.players.length >= 6;
    form.appendChild(addBtn);

    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = nameInput.value.trim();
      if (!name) return;
      if (state.players.length >= 6) return;
      const id = `p${playerCounter++}`;
      engine.addPlayer(id, name);
      nameInput.value = '';
      nameInput.focus();
    });

    root.appendChild(form);

    // Player list
    const list = document.createElement('ul');
    list.className = 'player-list';

    for (const player of state.players) {
      const item = document.createElement('li');
      item.className = 'player-item';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;
      item.appendChild(nameSpan);

      // Host (p0) cannot be removed — always keep at least one player
      if (player.id !== 'p0') {
        const removeBtn = document.createElement('button');
        removeBtn.className = 'player-remove';
        removeBtn.textContent = '✕';
        removeBtn.setAttribute('aria-label', `Ukloni ${player.name}`);
        removeBtn.addEventListener('click', () => engine.removePlayer(player.id));
        item.appendChild(removeBtn);
      }

      list.appendChild(item);
    }

    root.appendChild(list);

    // Mode selector
    const modeSection = document.createElement('div');
    modeSection.className = 'mode-selector';

    const loudBtn = document.createElement('button');
    loudBtn.className = `mode-btn${state.playMode === 'loud' ? ' active' : ''}`;
    loudBtn.textContent = '🔊 Glasno';
    loudBtn.addEventListener('click', () => engine.setPlayMode('loud'));
    modeSection.appendChild(loudBtn);

    const silentBtn = document.createElement('button');
    silentBtn.className = `mode-btn${state.playMode === 'silent' ? ' active' : ''}`;
    silentBtn.textContent = '🤫 Tiho';
    silentBtn.addEventListener('click', () => engine.setPlayMode('silent'));
    modeSection.appendChild(silentBtn);

    root.appendChild(modeSection);

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Počni igru';
    startBtn.disabled = state.players.length < 2;
    startBtn.addEventListener('click', () => engine.startGame());
    root.appendChild(startBtn);

    container.appendChild(root);
  }

  // Initial render
  render(engine.getState());

  // Subscribe to state changes
  const unsub = engine.on(event => {
    if (event.type === 'state') {
      render(event.state);
    }
  });

  // Cleanup when container is removed from DOM (best-effort via MutationObserver)
  const observer = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      unsub();
      observer.disconnect();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ── Networked host lobby ──────────────────────────────────────────────────────

export function renderHostLobby(
  container: HTMLElement,
  engine: GameEngine,
  roomId: string,
): () => void {
  const joinUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

  function render(state: GameState): void {
    if (state.phase !== 'lobby') return;
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'lobby';

    const title = document.createElement('h1');
    title.className = 'lobby-title';
    title.textContent = 'SEREŠ?';
    root.appendChild(title);

    // QR code + URL
    const qrSection = document.createElement('div');
    qrSection.className = 'qr-section';

    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, joinUrl, {
      width: 220,
      color: { dark: '#eaeaea', light: '#16213e' },
    }).catch(() => {});
    qrSection.appendChild(canvas);

    const urlRow = document.createElement('div');
    urlRow.className = 'url-row';
    const urlSpan = document.createElement('span');
    urlSpan.className = 'room-url';
    urlSpan.textContent = joinUrl;
    urlRow.appendChild(urlSpan);
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.textContent = 'Kopiraj';
    copyBtn.addEventListener('click', () => {
      const confirm = () => {
        copyBtn.textContent = '✓';
        setTimeout(() => { copyBtn.textContent = 'Kopiraj'; }, 1500);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(joinUrl).then(confirm).catch(fallbackCopy);
      } else {
        fallbackCopy();
      }
      function fallbackCopy() {
        const ta = document.createElement('textarea');
        ta.value = joinUrl;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        confirm();
      }
    });
    urlRow.appendChild(copyBtn);
    qrSection.appendChild(urlRow);
    root.appendChild(qrSection);

    // Player list
    const list = document.createElement('ul');
    list.className = 'player-list';
    for (const player of state.players) {
      const item = document.createElement('li');
      item.className = 'player-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = player.name;
      item.appendChild(nameSpan);
      list.appendChild(item);
    }
    root.appendChild(list);

    // Mode selector
    const modeSection = document.createElement('div');
    modeSection.className = 'mode-selector';
    const loudBtn = document.createElement('button');
    loudBtn.className = `mode-btn${state.playMode === 'loud' ? ' active' : ''}`;
    loudBtn.textContent = '🔊 Glasno';
    loudBtn.addEventListener('click', () => engine.setPlayMode('loud'));
    modeSection.appendChild(loudBtn);
    const silentBtn = document.createElement('button');
    silentBtn.className = `mode-btn${state.playMode === 'silent' ? ' active' : ''}`;
    silentBtn.textContent = '🤫 Tiho';
    silentBtn.addEventListener('click', () => engine.setPlayMode('silent'));
    modeSection.appendChild(silentBtn);
    root.appendChild(modeSection);

    // Start button
    const startBtn = document.createElement('button');
    startBtn.className = 'start-btn';
    startBtn.textContent = 'Počni igru';
    startBtn.disabled = state.players.length < 2;
    startBtn.addEventListener('click', () => engine.startGame());
    root.appendChild(startBtn);

    container.appendChild(root);
  }

  render(engine.getState());

  const unsub = engine.on(event => {
    if (event.type === 'state') render(event.state);
  });

  return unsub;
}

// ── Client join / waiting screens ─────────────────────────────────────────────

export function renderClientJoin(
  container: HTMLElement,
  onJoin: (name: string) => void,
): void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'lobby';

  const title = document.createElement('h1');
  title.className = 'lobby-title';
  title.textContent = 'SEREŠ?';
  root.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'lobby-subtitle';
  subtitle.textContent = 'Unesi ime i pridruži se igri';
  root.appendChild(subtitle);

  const form = document.createElement('form');
  form.className = 'player-form';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Tvoje ime';
  input.maxLength = 20;
  input.autocomplete = 'off';
  input.autocapitalize = 'words';
  input.autofocus = true;
  form.appendChild(input);

  const joinBtn = document.createElement('button');
  joinBtn.type = 'submit';
  joinBtn.textContent = 'Pridruži se';
  form.appendChild(joinBtn);

  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    joinBtn.disabled = true;
    onJoin(name);
  });

  root.appendChild(form);
  container.appendChild(root);
  input.focus();
}

export function renderClientWaiting(
  container: HTMLElement,
  players: Player[],
): void {
  container.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'lobby';

  const title = document.createElement('h1');
  title.className = 'lobby-title';
  title.textContent = 'SEREŠ?';
  root.appendChild(title);

  const waiting = document.createElement('p');
  waiting.className = 'lobby-subtitle';
  waiting.textContent = 'Čekanje na domaćina...';
  root.appendChild(waiting);

  const list = document.createElement('ul');
  list.className = 'player-list';
  for (const p of players) {
    const item = document.createElement('li');
    item.className = 'player-item';
    item.textContent = p.name;
    list.appendChild(item);
  }
  root.appendChild(list);

  container.appendChild(root);
}
