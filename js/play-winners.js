const MAX_WINNERS_PER_PLAY = 4;
const MAX_PLACEMENTS_PER_PLAY = 3;
const POINTS_BY_PLACE = [3, 2, 1];
const PLACE_LABELS = ["1st", "2nd", "3rd"];

function getCompetitorType(tournament) {
  const type = String(tournament?.competitorType || "player").trim().toLowerCase();
  return type === "team" || type === "teams" ? "team" : "player";
}

function getPlayWinnerIds(play) {
  if (!play) return [];
  const source = Array.isArray(play.winnerIds)
    ? play.winnerIds
    : Array.isArray(play.winnerPlayerIds)
      ? play.winnerPlayerIds
      : null;
  if (source) {
    const seen = new Set();
    const ids = [];
    for (const id of source) {
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
  if (!play) return [];
  const source = Array.isArray(play.placementIds)
    ? play.placementIds
    : Array.isArray(play.placementPlayerIds)
      ? play.placementPlayerIds
      : null;
  if (!source) return [];
  const seen = new Set();
  const ids = [];
  for (const id of source) {
    const value = String(id || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    ids.push(value);
    if (ids.length >= MAX_PLACEMENTS_PER_PLAY) break;
  }
  return ids;
}

function rosterIdsFromTournament(tournament) {
  if (Array.isArray(tournament?.competitorIds)) {
    return tournament.competitorIds.map(String);
  }
  if (Array.isArray(tournament?.playerIds)) {
    return tournament.playerIds.map(String);
  }
  return [];
}

function playerDisplayLabel(player, fallbackId) {
  if (!player) return fallbackId || "";
  return player.nickname ? `${player.name} (${player.nickname})` : player.name;
}

/**
 * Returns a function (id) => display label for competitors in a tournament.
 * For player tournaments, labels come from players; for team tournaments, from teams.
 */
function buildCompetitorLabeler(tournament, players, teams) {
  const type = getCompetitorType(tournament);
  const playerList = Array.isArray(players) ? players : [];
  const teamList = Array.isArray(teams) ? teams : [];

  return function competitorLabel(id) {
    const key = String(id || "");
    if (type === "team") {
      const team = teamList.find((t) => t.id === key);
      return team ? team.name : key;
    }
    const player = playerList.find((p) => p.id === key);
    return playerDisplayLabel(player, key);
  };
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
