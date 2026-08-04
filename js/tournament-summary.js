(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";

  const pageStatus = document.getElementById("page-status");
  const summaryPanel = document.getElementById("summary-panel");
  const summarySubtitle = document.getElementById("summary-subtitle");
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

  function renderSummary(tournament, players, teams) {
    if (tournament.status !== "ended") {
      pageStatus.textContent = "This tournament is still active. End it to view the final summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
      summarySubtitle.textContent = "Summary is available after a tournament ends.";
      return;
    }

    const { mode, standings, totalPlays, topScore, leaders } = buildStandings(
      tournament,
      players,
      teams
    );
    const isPoints = mode === "points";
    const competitorType = getCompetitorType(tournament);
    const competitorLabel = competitorType === "team" ? "Teams" : "Players";

    summarySubtitle.textContent = isPoints
      ? "Results ranked by points (3-2-1 per game)."
      : "Results ranked by wins.";

    tournamentName.textContent = tournament.name || "Tournament";
    tournamentMeta.textContent = `${formatDate(tournament.date)} · ${
      isPoints ? "Points scoring" : "Game wins"
    } · ${competitorLabel}`;
    gamesPlayed.textContent = `Games played: ${totalPlays}`;

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
    summaryPanel.classList.remove("hidden");
  }

  async function loadSummary() {
    const id = getQueryId();
    if (!id) {
      pageStatus.textContent = "Missing tournament id.";
      return;
    }

    pageStatus.textContent = "Loading summary…";
    pageStatus.classList.remove("hidden");
    summaryPanel.classList.add("hidden");

    try {
      const [tournament, playerData, teamData] = await Promise.all([
        fetchJson(`${API_URL}?id=${encodeURIComponent(id)}`),
        fetchJson(PLAYERS_API_URL),
        fetchJson(TEAMS_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      const teams = Array.isArray(teamData) ? teamData : [];
      renderSummary(tournament, players, teams);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
    }
  }

  loadSummary();

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      window.location.href = "tournaments.html";
    });
  }
})();
