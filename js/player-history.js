(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";

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

  function gameWinsInTournament(tournament) {
    if (getScoringMode(tournament) === "points") {
      const rosterIds = Array.isArray(tournament.playerIds)
        ? tournament.playerIds.map(String)
        : [];
      const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
      const winCounts = {};
      for (const id of rosterIds) {
        winCounts[id] = 0;
      }
      for (const play of plays) {
        const placements = getPlayPlacementIds(play);
        const firstPlace = placements[0];
        if (!firstPlace) continue;
        if (!(firstPlace in winCounts)) {
          winCounts[firstPlace] = 0;
        }
        winCounts[firstPlace] += 1;
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

  function buildStandings(players, tournaments) {
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
      const winCounts = gameWinsInTournament(tournament);
      for (const [playerId, wins] of Object.entries(winCounts)) {
        if (byId[playerId]) {
          byId[playerId].gameWins += wins;
        }
      }
      for (const winnerId of topWinnerIds(tournament)) {
        if (byId[winnerId]) {
          byId[winnerId].tournamentWins += 1;
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
        return (b[otherKey] - a[otherKey]);
      }
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    });
  }

  function updateSortLabels() {
    const arrow = sortDir === "desc" ? " ↓" : " ↑";
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
        "grid grid-cols-[minmax(0,1fr)_11rem_8.5rem] items-center gap-3 py-3";
      li.innerHTML = `
        <span class="text-lg font-medium text-ink">${escapeHtml(row.label)}</span>
        <span class="text-right text-lg font-bold text-felt-dark">${row.tournamentWins}</span>
        <span class="text-right text-lg font-semibold text-ink">${row.gameWins}</span>
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
    listStatus.textContent = "Loading player history…";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    standingsHeader.classList.add("hidden");
    playerList.innerHTML = "";

    try {
      const [tournamentData, playerData] = await Promise.all([
        fetchJson(API_URL),
        fetchJson(PLAYERS_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      const tournaments = Array.isArray(tournamentData) ? tournamentData : [];
      standings = buildStandings(players, tournaments);
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
