const MAX_WINNERS_PER_PLAY = 4;

function getPlayWinnerIds(play) {
  if (!play) return [];
  if (Array.isArray(play.winnerPlayerIds)) {
    const seen = new Set();
    const ids = [];
    for (const id of play.winnerPlayerIds) {
      const value = String(id || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
      if (ids.length >= MAX_WINNERS_PER_PLAY) break;
    }
    return ids;
  }
  const legacy = play.winnerPlayerId ? String(play.winnerPlayerId).trim() : "";
  return legacy ? [legacy] : [];
}
