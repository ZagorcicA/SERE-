import type { ClientGameState, ClientRound, ClaimSummary, GameState } from '../core/types.js';

export function redact(state: GameState, recipientId: string): ClientGameState {
  const myHand = state.hands[recipientId] ?? [];

  let currentRound: ClientRound | null = null;
  if (state.currentRound) {
    const round = state.currentRound;
    const totalPileCount = round.plays.reduce((sum, p) => sum + p.cards.length, 0);
    const lastPlay = round.plays.at(-1);
    const claimChain: ClaimSummary[] = round.plays.map(play => ({
      playerId: play.playerId,
      playerName: state.players.find(p => p.id === play.playerId)?.name ?? '?',
      claimedCount: play.claimedCount,
      claimedRank: play.claimedRank,
    }));

    currentRound = {
      lockedRank: round.lockedRank,
      totalPileCount,
      lastPlayCount: lastPlay?.cards.length ?? 0,
      activePlayerId: round.activePlayerId,
      startPlayerId: round.startPlayerId,
      claimChain,
    };
  }

  return {
    phase: state.phase,
    players: state.players,
    myHand,
    myId: recipientId,
    currentRound,
    winnerId: state.winnerId,
    playMode: state.playMode,
  };
}
