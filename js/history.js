(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";

  const listStatus = document.getElementById("list-status");
  const actionStatus = document.getElementById("action-status");
  const historyList = document.getElementById("history-list");
  const emptyState = document.getElementById("empty-state");

  let players = [];
  let teams = [];
  let tournaments = [];
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

  function setActionStatus(message, isError = false) {
    if (!message) {
      actionStatus.classList.add("hidden");
      actionStatus.textContent = "";
      return;
    }
    actionStatus.textContent = message;
    actionStatus.classList.remove("hidden", "gt-status-err", "gt-status-ok");
    actionStatus.classList.add(isError ? "gt-status-err" : "gt-status-ok");
  }

  function formatCompetitors(tournament) {
    const type = getCompetitorType(tournament);
    const ids = rosterIdsFromTournament(tournament);
    const heading = type === "team" ? "Teams" : "Players";
    if (!ids.length) {
      return `<p class="mt-1 text-sm gt-muted">No ${heading.toLowerCase()}</p>`;
    }
    const labeler = buildCompetitorLabeler(tournament, players, teams);
    const names = GameTracker.sortByName(ids, (id) => labeler(id))
      .map((id) => escapeHtml(labeler(id)))
      .join(", ");
    return `<p class="mt-1 text-sm gt-muted">${heading}: ${names}</p>`;
  }

  function formatWinners(tournament) {
    const { mode, leaders, standings, topScore } = getTournamentLeaders(tournament);
    const labeler = buildCompetitorLabeler(tournament, players, teams);
    const scoringNote =
      mode === "points"
        ? '<p class="mt-1 text-xs gt-muted">Points scoring</p>'
        : "";
    const typeNote =
      getCompetitorType(tournament) === "team"
        ? '<p class="mt-1 text-xs gt-muted">Team tournament</p>'
        : "";

    if (mode === "points") {
      const scoredStandings = standings.filter((entry) => entry.score > 0);
      if (!scoredStandings.length) {
        return `${scoringNote}${typeNote}<p class="mt-1 text-sm gt-muted">Winner: None</p>`;
      }

      const scoreGroups = [];
      for (const entry of scoredStandings) {
        let group = scoreGroups.find((item) => item.score === entry.score);
        if (!group) {
          if (scoreGroups.length >= 3) break;
          group = { score: entry.score, entries: [] };
          scoreGroups.push(group);
        }
        group.entries.push(entry);
      }

      const placeLabels = ["Winner", "Second", "Third"];
      const results = scoreGroups
        .map((group, index) => {
          const names = GameTracker.sortByName(group.entries, (entry) => labeler(entry.id)).map(
            (entry) => escapeHtml(labeler(entry.id))
          );
          const tieLabel = group.entries.length > 1 ? " (tie)" : "";
          const pointLabel = `${group.score} point${group.score === 1 ? "" : "s"}`;
          const eachLabel = group.entries.length > 1 ? " each" : "";
          return `<p class="mt-1 text-sm font-bold text-felt-dark">${placeLabels[index]}${tieLabel}: ${names.join(", ")} — ${pointLabel}${eachLabel}</p>`;
        })
        .join("");

      return `${scoringNote}${typeNote}${results}`;
    }

    if (!leaders.length || topScore <= 0) {
      return `${scoringNote}${typeNote}<p class="mt-1 text-sm gt-muted">Winners: None</p>`;
    }

    const names = GameTracker.sortByName(leaders, (entry) => labeler(entry.id)).map((entry) =>
      escapeHtml(labeler(entry.id))
    );
    const winLabel = `${topScore} win${topScore === 1 ? "" : "s"}`;
    return `${scoringNote}${typeNote}<p class="mt-1 text-sm font-bold text-felt-dark">Winners: ${names.join(", ")} (${winLabel})</p>`;
  }

  function tournamentYear(tournament) {
    const date = String(tournament.date || "");
    const year = date.slice(0, 4);
    if (/^\d{4}$/.test(year)) return year;
    return "Unknown";
  }

  function tournamentItemHtml(tournament) {
    return `
      <li class="flex flex-wrap items-start justify-between gap-3 py-3">
        <div>
          <p class="font-medium text-ink">${escapeHtml(tournament.name)}</p>
          ${formatWinners(tournament)}
          <p class="mt-1 text-sm gt-muted">${formatDate(tournament.date)}</p>
          ${formatCompetitors(tournament)}
        </div>
        <div class="flex flex-wrap gap-2">
          <a
            href="tournament-summary.html?id=${encodeURIComponent(tournament.id)}"
            class="gt-btn-secondary text-sm"
          >
            View summary
          </a>
          <button
            type="button"
            data-action="reactivate"
            data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-secondary text-sm"
          >
            Re-activate
          </button>
          <button
            type="button"
            data-action="delete"
            data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-danger text-sm"
          >
            Remove
          </button>
        </div>
      </li>
    `;
  }

  function renderHistory() {
    historyList.innerHTML = "";
    listStatus.classList.add("hidden");

    const ended = tournaments
      .filter((t) => t.status === "ended")
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

    if (!ended.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    const currentYear = String(new Date().getFullYear());
    const byYear = {};

    for (const tournament of ended) {
      const year = tournamentYear(tournament);
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(tournament);
    }

    const years = Object.keys(byYear).sort((a, b) => {
      if (a === "Unknown") return 1;
      if (b === "Unknown") return -1;
      return Number(b) - Number(a);
    });

    for (const year of years) {
      const isCurrentYear = year === currentYear;
      const section = document.createElement("div");
      section.className = "rounded-md border border-wood/25 bg-parchment-deep/40 p-3";
      section.setAttribute("data-year-section", year);

      const yearLabel =
        year === "Unknown"
          ? "Tournaments History for Unknown Year"
          : `Tournaments History for ${year}`;

      section.innerHTML = `
        <a
          href="#"
          data-action="toggle-year"
          data-year="${escapeHtml(year)}"
          class="inline-block font-display text-xl font-semibold text-felt-dark underline hover:text-felt"
          aria-expanded="${isCurrentYear ? "true" : "false"}"
        >
          ${escapeHtml(yearLabel)}
        </a>
        <ul class="mt-2 divide-y divide-wood/20${isCurrentYear ? "" : " hidden"}" data-year-list="${escapeHtml(year)}">
          ${byYear[year].map(tournamentItemHtml).join("")}
        </ul>
      `;

      historyList.appendChild(section);
    }
  }

  async function loadHistory() {
    listStatus.textContent = "Loading history…";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    historyList.innerHTML = "";

    try {
      const [tournamentData, playerData, teamData] = await Promise.all([
        fetchJson(API_URL),
        fetchJson(PLAYERS_API_URL),
        fetchJson(TEAMS_API_URL),
      ]);
      players = Array.isArray(playerData) ? playerData : [];
      teams = Array.isArray(teamData) ? teamData : [];
      tournaments = Array.isArray(tournamentData) ? tournamentData : [];
      renderHistory();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load history.";
      listStatus.classList.remove("hidden");
    }
  }

  historyList.addEventListener("click", async (event) => {
    const yearToggle = event.target.closest('[data-action="toggle-year"]');
    if (yearToggle) {
      event.preventDefault();
      const year = yearToggle.getAttribute("data-year");
      const selectedList = historyList.querySelector(`ul[data-year-list="${year}"]`);
      if (!selectedList) return;

      const willOpen = selectedList.classList.contains("hidden");

      historyList.querySelectorAll("ul[data-year-list]").forEach((list) => {
        list.classList.add("hidden");
      });
      historyList.querySelectorAll('[data-action="toggle-year"]').forEach((link) => {
        link.setAttribute("aria-expanded", "false");
      });

      if (willOpen) {
        selectedList.classList.remove("hidden");
        yearToggle.setAttribute("aria-expanded", "true");
      }
      return;
    }

    const reactivateBtn = event.target.closest('button[data-action="reactivate"]');
    if (reactivateBtn) {
      const id = reactivateBtn.getAttribute("data-id");
      const tournament = tournaments.find((t) => t.id === id);
      if (!tournament) return;

      if (
        !window.confirm(
          `Re-activate ${tournament.name}? It will move back to active tournaments so you can record more games.`
        )
      ) {
        return;
      }

      reactivateBtn.disabled = true;
      try {
        await fetchJson(API_URL, "PUT", {
          id: tournament.id,
          name: tournament.name,
          date: tournament.date,
          status: "active",
          scoringMode: getScoringMode(tournament),
          competitorType: getCompetitorType(tournament),
          competitorIds: rosterIdsFromTournament(tournament),
        });
        window.location.href = `active-tournament.html?id=${encodeURIComponent(tournament.id)}`;
      } catch (err) {
        reactivateBtn.disabled = false;
        setActionStatus(err.message || "Failed to re-activate tournament.", true);
      }
      return;
    }

    const button = event.target.closest('button[data-action="delete"]');
    if (!button) return;

    const id = button.getAttribute("data-id");
    const tournament = tournaments.find((t) => t.id === id);
    if (!tournament) return;

    if (!window.confirm(`Remove ${tournament.name} from history? This cannot be undone.`)) {
      return;
    }

    try {
      await fetchJson(API_URL, "DELETE", { id });
      setActionStatus("Tournament removed.");
      await loadHistory();
    } catch (err) {
      setActionStatus(err.message || "Failed to remove tournament.", true);
    }
  });

  loadHistory();
})();
