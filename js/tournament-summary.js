(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";
  const GAMES_API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const summaryPanel = document.getElementById("summary-panel");
  const tournamentName = document.getElementById("tournament-name");
  const tournamentDate = document.getElementById("tournament-date");
  const tournamentScoringBadge = document.getElementById("tournament-scoring-badge");
  const tournamentCompetitorBadge = document.getElementById("tournament-competitor-badge");
  const gamesPlayed = document.getElementById("games-played");
  const topWinners = document.getElementById("top-winners");
  const topWinnersText = document.getElementById("top-winners-text");
  const standingsList = document.getElementById("standings-list");
  const standingsEmpty = document.getElementById("standings-empty");
  const returnBtn = document.getElementById("return-btn");
  const reactivateBtn = document.getElementById("reactivate-btn");
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const fetchJson = GameTracker.api.bind(GameTracker);
  let currentTournament = null;
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

  function buildCompetitorGameDetails(tournament) {
    const isPoints = getScoringMode(tournament) === "points";
    const rosterIds = rosterIdsFromTournament(tournament);
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    const details = new Map();

    for (const id of rosterIds) {
      details.set(id, []);
    }

    for (const play of plays) {
      const name = gameLabel(play.gameId);
      if (isPoints) {
        const groups = getPlayPlacementGroups(play);
        groups.forEach((ids, placeIndex) => {
          for (const competitorId of ids) {
            if (!details.has(competitorId)) {
              details.set(competitorId, []);
            }
            details.get(competitorId).push({
              label: `${name} — ${PLACE_LABELS[placeIndex]}`,
            });
          }
        });
      } else {
        for (const winnerId of getPlayWinnerIds(play)) {
          if (!details.has(winnerId)) {
            details.set(winnerId, []);
          }
          details.get(winnerId).push({ label: name });
        }
      }
    }

    return details;
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
    currentTournament = tournament;
    if (reactivateBtn) {
      reactivateBtn.classList.add("hidden");
    }

    if (tournament.status !== "ended") {
      pageStatus.textContent = "This tournament is still active. End it to view the final summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
      return;
    }

    if (reactivateBtn) {
      reactivateBtn.classList.remove("hidden");
    }

    const { mode, standings, totalPlays, topScore, leaders } = buildStandings(
      tournament,
      players,
      teams
    );
    const isPoints = mode === "points";
    const competitorType = getCompetitorType(tournament);
    const competitorLabel = competitorType === "team" ? "Teams" : "Players";
    const gameDetails = buildCompetitorGameDetails(tournament);

    tournamentName.textContent = tournament.name || "Tournament";
    if (tournamentDate) {
      tournamentDate.textContent = formatDate(tournament.date);
    }
    if (tournamentScoringBadge) {
      tournamentScoringBadge.textContent = scoringModeBadgeLabel(tournament);
    }
    if (tournamentCompetitorBadge) {
      tournamentCompetitorBadge.textContent = competitorLabel;
    }
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
          const placeRowClass =
            index < PLACE_MODS.length ? `gt-place-row--${PLACE_MODS[index]}` : "bg-panel-muted";
          const scoreLabel = isPoints
            ? `${row.score} pt${row.score === 1 ? "" : "s"}`
            : `${row.score} win${row.score === 1 ? "" : "s"}`;
          const rankLabel = index < PLACE_LABELS.length ? PLACE_LABELS[index] : `#${index + 1}`;
          const playerGames = gameDetails.get(row.id) || [];
          const toggleHtml = playerGames.length
            ? `<button type="button" data-action="toggle-player-games" data-competitor-id="${escapeHtml(row.id)}" aria-expanded="false" aria-label="Show games" class="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line/60 text-base font-semibold leading-none text-felt-dark hover:text-ink">+</button>`
            : `<span class="w-5 shrink-0" aria-hidden="true"></span>`;
          const gamesListHtml = playerGames.length
            ? `<ul class="hidden mt-2 ml-7 space-y-1" data-player-games="${escapeHtml(row.id)}">${playerGames
                .map((entry) => `<li class="text-sm gt-muted">${escapeHtml(entry.label)}</li>`)
                .join("")}</ul>`
            : "";

          return `
            <li class="rounded-md px-3 py-2 ${placeRowClass}">
              <div class="flex items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  ${toggleHtml}
                  <span class="text-sm font-medium gt-place-rank gt-muted">${rankLabel}</span>
                  <span class="font-medium text-ink">${escapeHtml(row.label)}</span>
                </div>
                <span class="text-sm font-semibold text-ink">${scoreLabel}</span>
              </div>
              ${gamesListHtml}
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
      const [tournament, playerData, teamData, gameData] = await Promise.all([
        fetchJson(`${API_URL}?id=${encodeURIComponent(id)}`),
        fetchJson(PLAYERS_API_URL),
        fetchJson(TEAMS_API_URL),
        fetchJson(GAMES_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      const teams = Array.isArray(teamData) ? teamData : [];
      games = Array.isArray(gameData) ? gameData : [];
      renderSummary(tournament, players, teams);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
    }
  }

  loadSummary();

  if (standingsList) {
    standingsList.addEventListener("click", (event) => {
      const btn = event.target.closest('[data-action="toggle-player-games"]');
      if (!btn) return;

      const competitorId = btn.getAttribute("data-competitor-id");
      const list = standingsList.querySelector(`ul[data-player-games="${competitorId}"]`);
      if (!list) return;

      const willOpen = list.classList.contains("hidden");
      list.classList.toggle("hidden", !willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      btn.textContent = willOpen ? "−" : "+";
      btn.setAttribute("aria-label", willOpen ? "Hide games" : "Show games");
    });
  }

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      window.location.href = "tournaments.html";
    });
  }

  if (reactivateBtn) {
    reactivateBtn.addEventListener("click", async () => {
      if (!currentTournament || currentTournament.status !== "ended") return;

      if (
        !window.confirm(
          `Re-activate ${currentTournament.name}? It will move back to active tournaments so you can record more games.`
        )
      ) {
        return;
      }

      reactivateBtn.disabled = true;
      try {
        await fetchJson(API_URL, "PUT", {
          id: currentTournament.id,
          name: currentTournament.name,
          date: currentTournament.date,
          status: "active",
          scoringMode: getScoringMode(currentTournament),
          competitorType: getCompetitorType(currentTournament),
          competitorIds: rosterIdsFromTournament(currentTournament),
        });
        window.location.href = `active-tournament.html?id=${encodeURIComponent(currentTournament.id)}`;
      } catch (err) {
        reactivateBtn.disabled = false;
        pageStatus.textContent = err.message || "Failed to re-activate tournament.";
        pageStatus.classList.remove("hidden");
        pageStatus.classList.add("gt-status-err");
      }
    });
  }
})();
