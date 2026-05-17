# SEREŠ?

Browser-based digital version of the Croatian card-bluffing game **Blef** (BS / Cheat). Designed for a small group of friends in the same room — one person hosts from their phone, others scan a QR code and join. No installs, no accounts, no backend.

---

## What was built (v1)

### Stack
- **Vite + TypeScript** — no UI framework, plain DOM manipulation. Keeps the bundle small (~40 KB gzipped) and gives full control over the host-authoritative state flow.
- **PeerJS** — WebRTC data channels via the public PeerJS broker. Signaling is a one-time ICE/SDP exchange; after that all game traffic is peer-to-peer.
- **vite-plugin-pwa** — installable to home screen, service worker caches the app shell for offline use.
- **Vitest** — unit tests for the rules engine, runs in Node (no browser needed).

### Architecture

```
src/
├── core/               # Pure game logic — zero browser/network deps
│   ├── types.ts        # All shared types: Card, Rank, GameState, ClientGameState, …
│   ├── deck.ts         # Build 54-card deck, Fisher-Yates shuffle, round-robin deal
│   ├── rules.ts        # validatePlay, resolveBluff, checkWin, nextPlayerIndex
│   └── state.ts        # Pure state-transition helpers (applyPlay, applyBluffResult, …)
│
├── host/
│   ├── engine.ts       # GameEngine class — the state machine, host-authoritative
│   └── redactor.ts     # Strips hidden card info before sending state to each client
│
├── net/
│   ├── messages.ts     # Discriminated union types for all host↔client messages
│   ├── host-peer.ts    # PeerJS host: accepts connections, routes intents → engine
│   └── client-peer.ts  # PeerJS client: connects to host, sends intents, receives state
│
├── ui/
│   ├── lobby.ts        # Hotseat lobby + networked host lobby (QR code) + client join
│   ├── game.ts         # Hotseat game view (all hands visible — dev/testing mode)
│   ├── networked-game.ts # Game view using ClientGameState (host-player + clients)
│   ├── rank-picker.ts  # Rank selection bottom sheet
│   ├── reveal.ts       # Bluff reveal overlay with sequential card flip animation
│   └── animations.ts   # CSS animation helpers (deal, flip, sweep, shake)
│
├── styles/
│   ├── base.css        # Reset, CSS variables, button/input base styles
│   ├── lobby.css       # Lobby, QR section, connecting/error screens
│   └── game.css        # Game board, cards, overlays, animations
│
└── app.ts              # Entry point — detects host vs client role from URL params
```

### How roles work

| Who | URL | Role |
|-----|-----|------|
| Room creator | `/` | **Host** — runs GameEngine, HostPeer, sees redacted state |
| Everyone else | `/?room=<id>` | **Client** — runs ClientPeer, receives redacted state from host |

The host's PeerJS peer ID becomes the room ID shown in the QR code. All game logic runs on the host; clients send intents (`PLAY_CARDS`, `CALL_BLUFF`, etc.) and receive back their own redacted view of the state — they never see other players' cards.

### Game rules implemented
- 54-card deck (52 + 2 jokers), dealt evenly among 2–6 players
- Round-starter declares a rank; that rank is locked for the whole round
- Each subsequent player plays cards face-down claiming the same rank, or calls **SEREŠ?**
- Jokers are wild — count as any rank
- Bluff caller revealed: liar picks up the pile, truth-teller's caller picks up the pile
- First player to empty their hand (without being caught) wins
- Edge case: player who empties hand on their last play — next player still gets to call SEREŠ?

### Play modes
Chosen by the host in the lobby, locked once the game starts:

- **Glasno (Loud)** — rank is announced verbally. Only the round-starter gets a rank picker; follow-up players just play cards silently.
- **Tiho (Silent)** — everything is on-screen. Every play shows a picker (pre-filled for follow-ups) and a claim feed so no one needs to speak.

### Information hiding
`src/host/redactor.ts` — the only place that reads `GameState.hands`. Before any state is sent to a client, it produces a `ClientGameState` containing only:
- That player's own hand (`myHand`)
- All opponents' **card counts** (not cards)
- The claim chain (who played how many of what rank) — no actual cards
- Pile total count

Raw `GameState` (with full hands) never leaves the host process.

### Security note
`host-peer.ts` validates `CONFIRM_PICKUP` and `START_NEXT_ROUND` intents against a `pendingPickupPlayerId` tracked from the reveal event — so a rogue client can't redirect the pile to a different player.

---

## Running locally

```bash
npm install
npm run dev
```

Vite prints two URLs. **Open the Network URL** (e.g. `http://192.168.x.x:5173`) — not localhost — so the QR code encodes an address your phone can reach. Laptop and phones must be on the same Wi-Fi or hotspot.

## Tests

```bash
npm test
```

97 unit tests covering deck building, shuffle, deal distribution, all rule validation paths, joker wildcard behaviour, bluff resolution, win detection, and every state transition. All run in Node — no browser required.

## Build / deploy

```bash
npm run build   # outputs to dist/
```

`dist/` is a static PWA — deploy to Cloudflare Pages or GitHub Pages at zero cost. No server-side component beyond the PeerJS public broker (used only for the initial WebRTC handshake).

---

