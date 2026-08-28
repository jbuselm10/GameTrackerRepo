(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";

  const listStatus = document.getElementById("list-status");
  const standingsHeader = document.getElementById("standings-header");
  const playerList = document.getElementById("player-list");
  const emptyState = document.getElementById("empty-state");
  const sortTournamentBtn = document.getElementById("sort-tournament-wins");
  const sortGameBtn = document.getElementById("sort-game-wins");

  let standings = [];
  let sortKey = "tournamentWins";
  let sortDir = "desc";
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const fetchJson = GameTracker.api.bind(GameTracker);

  function playerLabel(player) {
    if (!player) return "";
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function teamMemberIds(teamId, teams) {
    const team = teams.find((t) => t.id === teamId);
    if (!team || !Array.isArray(team.playerIds)) return [];
    return team.playerIds.map(String);
  }

  /**
   * Expand a competitor ID to the player IDs that should receive credit.
   * Player tournaments: the competitor id itself.
   * Team tournaments: every member of that team.
   */
  function expandToPlayerIds(competitorId, tournament, teams) {
    if (getCompetitorType(tournament) === "team") {
      return teamMemberIds(competitorId, teams);
    }
    return [String(competitorId)];
  }

  function gameWinsByCompetitor(tournament) {
    if (getScoringMode(tournament) === "points") {
      const rosterIds = rosterIdsFromTournament(tournament);
      const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
      const winCounts = {};
      for (const id of rosterIds) {
        winCounts[id] = 0;
      }
      for (const play of plays) {
        const groups = getPlayPlacementGroups(play);
        for (const firstPlace of groups[0] || []) {
          if (!(firstPlace in winCounts)) {
            winCounts[firstPlace] = 0;
          }
          winCounts[firstPlace] += 1;
        }
      }
      return winCounts;
    }
    return buildGameWinCounts(tournament);
  }

  function topWinnerIds(tournament) {
    const { leaders, topScore } = getTournamentLeaders(tournament);
    if (!leaders.length || topScore <= 0) return [];
    return leaders.map((entry) => entry.id);
  }

  function buildStandings(players, tournaments, teams) {
    const ended = tournaments.filter((t) => t.status === "ended");
    const stats = players.map((player) => ({
      id: player.id,
      label: playerLabel(player),
      tournamentWins: 0,
      gameWins: 0,
    }));
    const byId = {};
    for (const row of stats) {
      byId[row.id] = row;
    }

    for (const tournament of ended) {
      const winCounts = gameWinsByCompetitor(tournament);
      for (const [competitorId, wins] of Object.entries(winCounts)) {
        for (const playerId of expandToPlayerIds(competitorId, tournament, teams)) {
          if (byId[playerId]) {
            byId[playerId].gameWins += wins;
          }
        }
      }
      for (const winnerId of topWinnerIds(tournament)) {
        for (const playerId of expandToPlayerIds(winnerId, tournament, teams)) {
          if (byId[playerId]) {
            byId[playerId].tournamentWins += 1;
          }
        }
      }
    }

    return stats;
  }

  function sortStandings() {
    const dir = sortDir === "asc" ? 1 : -1;
    standings.sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal !== bVal) {
        return (aVal - bVal) * dir;
      }
      const otherKey = sortKey === "tournamentWins" ? "gameWins" : "tournamentWins";
      if (a[otherKey] !== b[otherKey]) {
        return b[otherKey] - a[otherKey];
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }

  function updateSortLabels() {
    const arrow = sortDir === "desc" ? "\u00a0\u2193" : "\u00a0\u2191";
    sortTournamentBtn.textContent =
      "Tournament wins" + (sortKey === "tournamentWins" ? arrow : "");
    sortGameBtn.textContent = "Game wins" + (sortKey === "gameWins" ? arrow : "");
  }

  function renderStandings() {
    playerList.innerHTML = "";
    listStatus.classList.add("hidden");

    if (!standings.length) {
      standingsHeader.classList.add("hidden");
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");
    standingsHeader.classList.remove("hidden");
    updateSortLabels();

    for (const row of standings) {
      const li = document.createElement("li");
      li.className =
        "grid grid-cols-[minmax(0,1fr)_5.5rem_5rem] items-center gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_11rem_8.5rem] sm:gap-3";
      li.innerHTML = `
        <span class="min-w-0 break-words text-base font-medium text-ink sm:text-lg">${escapeHtml(row.label)}</span>
        <span class="text-right text-base font-bold text-felt-dark sm:text-lg">${row.tournamentWins}</span>
        <span class="text-right text-base font-semibold text-ink sm:text-lg">${row.gameWins}</span>
      `;
      playerList.appendChild(li);
    }
  }

  function setSort(key) {
    if (sortKey === key) {
      sortDir = sortDir === "desc" ? "asc" : "desc";
    } else {
      sortKey = key;
      sortDir = "desc";
    }
    sortStandings();
    renderStandings();
  }

  async function loadPlayerHistory() {
    listStatus.textContent = "Loading player history...";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    standingsHeader.classList.add("hidden");
    playerList.innerHTML = "";

    try {
      const [tournamentData, playerData, teamData] = await Promise.all([
        fetchJson(API_URL),
        fetchJson(PLAYERS_API_URL),
        fetchJson(TEAMS_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      const tournaments = Array.isArray(tournamentData) ? tournamentData : [];
      const teams = Array.isArray(teamData) ? teamData : [];
      standings = buildStandings(players, tournaments, teams);
      sortKey = "tournamentWins";
      sortDir = "desc";
      sortStandings();
      renderStandings();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load player history.";
      listStatus.classList.remove("hidden");
    }
  }

  sortTournamentBtn.addEventListener("click", () => setSort("tournamentWins"));
  sortGameBtn.addEventListener("click", () => setSort("gameWins"));

  loadPlayerHistory();
})();
