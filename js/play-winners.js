const MAX_WINNERS_PER_PLAY = 4;
const MAX_PLACES_PER_PLAY = 3;
const MAX_PLAYERS_PER_PLACE = 4;
/** @deprecated use MAX_PLACES_PER_PLAY — kept for older call sites */
const MAX_PLACEMENTS_PER_PLAY = MAX_PLACES_PER_PLAY;
const POINTS_BY_PLACE = [5, 3, 1];
const PLACE_LABELS = ["1st", "2nd", "3rd"];

function getCompetitorType(tournament) {
  const type = String(tournament?.competitorType || "player").trim().toLowerCase();
  return type === "team" || type === "teams" ? "team" : "player";
}

function getPlayersPerPlace(game) {
  const name = String(game?.name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (name === "corn hole" || name === "cornhole") {
    return 2;
  }
  return 1;
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

/**
 * Returns placement groups: [ [1st ids], [2nd ids], [3rd ids] ].
 * Accepts nested placementIds or legacy flat [1st, 2nd, 3rd].
 */
function getPlayPlacementGroups(play) {
  const empty = () =>
    Array.from({ length: MAX_PLACES_PER_PLAY }, () => []);

  if (!play) return empty();

  const source = Array.isArray(play.placementIds)
    ? play.placementIds
    : Array.isArray(play.placementPlayerIds)
      ? play.placementPlayerIds
      : null;
  if (!source || !source.length) return empty();

  const seen = new Set();
  const groups = empty();

  const isNested = source.some((entry) => Array.isArray(entry));
  if (isNested) {
    for (let place = 0; place < MAX_PLACES_PER_PLAY; place++) {
      const group = Array.isArray(source[place]) ? source[place] : [];
      for (const id of group) {
        const value = String(id || "").trim();
        if (!value || seen.has(value)) continue;
        seen.add(value);
        groups[place].push(value);
        if (groups[place].length >= MAX_PLAYERS_PER_PLACE) break;
      }
    }
    return groups;
  }

  // Legacy flat: index = place, one id per place
  for (let place = 0; place < MAX_PLACES_PER_PLAY && place < source.length; place++) {
    const value = String(source[place] || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    groups[place].push(value);
  }
  return groups;
}

/** Flat list of all placed competitor IDs (unique). */
function getPlayPlacementIds(play) {
  return getPlayPlacementGroups(play).flat();
}

function playHasPlacements(play) {
  return getPlayPlacementIds(play).length > 0;
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
    const groups = getPlayPlacementGroups(play);
    groups.forEach((ids, placeIndex) => {
      const points = POINTS_BY_PLACE[placeIndex] || 0;
      for (const playerId of ids) {
        if (!(playerId in pointTotals)) {
          pointTotals[playerId] = 0;
        }
        pointTotals[playerId] += points;
      }
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
