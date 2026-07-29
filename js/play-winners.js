const MAX_WINNERS_PER_PLAY = 4;
const MAX_PLACEMENTS_PER_PLAY = 3;
const POINTS_BY_PLACE = [3, 2, 1];
const PLACE_LABELS = ["1st", "2nd", "3rd"];

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

function getScoringMode(tournament) {
  const mode = String(tournament?.scoringMode || "gameWins").trim();
  return mode === "points" ? "points" : "gameWins";
}

function getPlayPlacementIds(play) {
  if (!play || !Array.isArray(play.placementPlayerIds)) return [];
  const seen = new Set();
  const ids = [];
  for (const id of play.placementPlayerIds) {
    const value = String(id || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
    if (ids.length >= MAX_PLACEMENTS_PER_PLAY) break;
  }
  return ids;
}

function rosterIdsFromTournament(tournament) {
  return Array.isArray(tournament?.playerIds) ? tournament.playerIds.map(String) : [];
}

function buildGameWinCounts(tournament) {
  const rosterIds = rosterIdsFromTournament(tournament);
  const plays = Array.isArray(tournament?.plays) ? tournament.plays : [];
  const winCounts = {};

  for (const id of rosterIds) {
    winCounts[id] = 0;
  }
  for (const play of plays) {
    for (const winnerId of getPlayWinnerIds(play)) {
      if (!(winnerId in winCounts)) {
        winCounts[winnerId] = 0;
      }
      winCounts[winnerId] += 1;
    }
  }
  return winCounts;
}

function buildPointTotals(tournament) {
  const rosterIds = rosterIdsFromTournament(tournament);
  const plays = Array.isArray(tournament?.plays) ? tournament.plays : [];
  const pointTotals = {};

  for (const id of rosterIds) {
    pointTotals[id] = 0;
  }
  for (const play of plays) {
    const placements = getPlayPlacementIds(play);
    placements.forEach((playerId, index) => {
      const points = POINTS_BY_PLACE[index] || 0;
      if (!(playerId in pointTotals)) {
        pointTotals[playerId] = 0;
      }
      pointTotals[playerId] += points;
    });
  }
  return pointTotals;
}

function getTournamentLeaders(tournament) {
  const mode = getScoringMode(tournament);
  const rosterIds = rosterIdsFromTournament(tournament);
  const totals = mode === "points" ? buildPointTotals(tournament) : buildGameWinCounts(tournament);

  const standings = rosterIds.map((id, rosterIndex) => ({
    id,
    score: totals[id] || 0,
    rosterIndex,
  }));

  standings.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.rosterIndex - b.rosterIndex;
  });

  const topScore = standings.length ? standings[0].score : 0;
  const leaders =
    topScore > 0 ? standings.filter((row) => row.score === topScore) : [];

  return { mode, leaders, standings, topScore, totals };
}
