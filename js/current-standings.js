(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";
  const GAMES_API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const standingsPanel = document.getElementById("standings-panel");
  const standingsSubtitle = document.getElementById("standings-subtitle");
  const tournamentName = document.getElementById("tournament-name");
  const tournamentMeta = document.getElementById("tournament-meta");
  const gamesPlayed = document.getElementById("games-played");
  const topWinners = document.getElementById("top-winners");
  const topWinnersText = document.getElementById("top-winners-text");
  const standingsList = document.getElementById("standings-list");
  const standingsEmpty = document.getElementById("standings-empty");
  const returnBtn = document.getElementById("return-btn");
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const fetchJson = GameTracker.api.bind(GameTracker);
  let currentTournamentId = "";
  let games = [];

  function formatDate(value) {
    if (!value) return "";
    const parts = String(value).split("-");
    if (parts.length !== 3) return escapeHtml(value);
    const [year, month, day] = parts;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(
      date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    );
  }

  function getQueryId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function gameLabel(gameId) {
    const game = games.find((g) => g.id === gameId);
    return game ? game.name : gameId;
  }

  function formatGamesPlayedLine(tournament) {
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    const totalPlays = plays.length;
    if (!totalPlays) {
      return "Games played: 0";
    }
    const names = plays.map((play) => gameLabel(play.gameId)).join(", ");
    return `Games played: ${totalPlays} - ${names}`;
  }

  function buildStandings(tournament, players, teams) {
    const { mode, standings, topScore, leaders } = getTournamentLeaders(tournament);
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    const labeler = buildCompetitorLabeler(tournament, players, teams);

    const rows = standings.map((row) => ({
      id: row.id,
      label: labeler(row.id),
      score: row.score,
    }));

    return {
      mode,
      standings: rows,
      totalPlays: plays.length,
      topScore,
      leaders: leaders.map((row) => ({
        id: row.id,
        label: labeler(row.id),
        score: row.score,
      })),
    };
  }

  function renderStandings(tournament, players, teams) {
    currentTournamentId = tournament.id || "";

    const { mode, standings, topScore, leaders } = buildStandings(
      tournament,
      players,
      teams
    );
    const isPoints = mode === "points";
    const competitorType = getCompetitorType(tournament);
    const competitorLabel = competitorType === "team" ? "Teams" : "Players";

    standingsSubtitle.textContent = isPoints
      ? "Current rankings by points (5-3-1 per game)."
      : "Current rankings by wins.";

    tournamentName.textContent = tournament.name || "Tournament";
    tournamentMeta.textContent = `${formatDate(tournament.date)} · ${
      isPoints ? "Points scoring" : "Game wins"
    } · ${competitorLabel}`;
    gamesPlayed.textContent = formatGamesPlayedLine(tournament);

    if (!standings.length) {
      standingsList.innerHTML = "";
      standingsEmpty.classList.remove("hidden");
      topWinners.classList.add("hidden");
    } else {
      standingsEmpty.classList.add("hidden");

      if (topScore > 0) {
        topWinners.classList.remove("hidden");
        if (isPoints) {
          topWinnersText.textContent =
            leaders.length === 1
              ? `${leaders[0].label} — ${topScore} point${topScore === 1 ? "" : "s"}`
              : `Tied: ${leaders.map((l) => l.label).join(", ")} — ${topScore} points each`;
        } else {
          topWinnersText.textContent =
            leaders.length === 1
              ? `${leaders[0].label} — ${topScore} win${topScore === 1 ? "" : "s"}`
              : `Tied: ${leaders.map((l) => l.label).join(", ")} — ${topScore} wins each`;
        }
      } else {
        topWinners.classList.add("hidden");
      }

      standingsList.innerHTML = standings
        .map((row, index) => {
          const isLeader = topScore > 0 && row.score === topScore;
          const scoreLabel = isPoints
            ? `${row.score} pt${row.score === 1 ? "" : "s"}`
            : `${row.score} win${row.score === 1 ? "" : "s"}`;
          return `
            <li class="flex items-center justify-between gap-3 rounded-md px-3 py-2 ${
              isLeader ? "bg-gold-soft ring-1 ring-gold" : "bg-parchment-deep"
            }">
              <div class="flex items-center gap-3">
                <span class="text-sm font-medium gt-muted">#${index + 1}</span>
                <span class="font-medium text-ink">${escapeHtml(row.label)}</span>
              </div>
              <span class="text-sm font-semibold text-ink">${scoreLabel}</span>
            </li>
          `;
        })
        .join("");
    }

    pageStatus.classList.add("hidden");
    standingsPanel.classList.remove("hidden");
  }

  async function loadStandings() {
    const id = getQueryId();
    if (!id) {
      pageStatus.textContent = "Missing tournament id.";
      return;
    }

    currentTournamentId = id;
    pageStatus.textContent = "Loading standings…";
    pageStatus.classList.remove("hidden");
    standingsPanel.classList.add("hidden");

    try {
      const [tournament, playerData, teamData, gameData] = await Promise.all([
        fetchJson(`${API_URL}?id=${encodeURIComponent(id)}`),
        fetchJson(PLAYERS_API_URL),
        fetchJson(TEAMS_API_URL),
        fetchJson(GAMES_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      const teams = Array.isArray(teamData) ? teamData : [];
      games = Array.isArray(gameData) ? gameData : [];
      renderStandings(tournament, players, teams);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load standings.";
      pageStatus.classList.remove("hidden");
      standingsPanel.classList.add("hidden");
    }
  }

  loadStandings();

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      const id = currentTournamentId || getQueryId();
      if (id) {
        window.location.href = `active-tournament.html?id=${encodeURIComponent(id)}`;
      } else {
        window.location.href = "tournaments.html";
      }
    });
  }
})();
