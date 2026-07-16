(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";

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

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

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

  function playerLabel(player, playerId) {
    if (!player) return playerId;
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function getQueryId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server returned invalid JSON. Is PHP running?");
      }
    }
    if (!response.ok) {
      throw new Error((data && data.error) || `Request failed (${response.status})`);
    }
    return data;
  }

  function buildStandings(tournament, players) {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds.map(String) : [];
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    const winCounts = {};

    for (const id of rosterIds) {
      winCounts[id] = 0;
    }
    for (const play of plays) {
      const winnerId = play && play.winnerPlayerId ? String(play.winnerPlayerId) : "";
      if (!winnerId) continue;
      if (!(winnerId in winCounts)) {
        winCounts[winnerId] = 0;
      }
      winCounts[winnerId] += 1;
    }

    const standings = rosterIds.map((id, index) => {
      const player = players.find((p) => p.id === id);
      return {
        id,
        label: playerLabel(player, id),
        wins: winCounts[id] || 0,
        rosterIndex: index,
      };
    });

    standings.sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.rosterIndex - b.rosterIndex;
    });

    return { standings, totalPlays: plays.length };
  }

  function renderSummary(tournament, players) {
    if (tournament.status !== "ended") {
      pageStatus.textContent = "This tournament is still active. End it to view the final summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
      summarySubtitle.textContent = "Summary is available after a tournament ends.";
      return;
    }

    const { standings, totalPlays } = buildStandings(tournament, players);

    tournamentName.textContent = tournament.name || "Tournament";
    tournamentMeta.textContent = formatDate(tournament.date);
    gamesPlayed.textContent = `Games played: ${totalPlays}`;

    if (!standings.length) {
      standingsList.innerHTML = "";
      standingsEmpty.classList.remove("hidden");
      topWinners.classList.add("hidden");
    } else {
      standingsEmpty.classList.add("hidden");
      const topWins = standings[0].wins;
      const leaders = standings.filter((row) => row.wins === topWins);

      if (topWins > 0) {
        topWinners.classList.remove("hidden");
        topWinnersText.textContent =
          leaders.length === 1
            ? `${leaders[0].label} — ${topWins} win${topWins === 1 ? "" : "s"}`
            : `Tied: ${leaders.map((l) => l.label).join(", ")} — ${topWins} wins each`;
      } else {
        topWinners.classList.add("hidden");
      }

      standingsList.innerHTML = standings
        .map((row, index) => {
          const isLeader = topWins > 0 && row.wins === topWins;
          return `
            <li class="flex items-center justify-between gap-3 rounded-md px-3 py-2 ${
              isLeader ? "bg-gold-soft ring-1 ring-gold" : "bg-parchment-deep"
            }">
              <div class="flex items-center gap-3">
                <span class="text-sm font-medium gt-muted">#${index + 1}</span>
                <span class="font-medium text-ink">${escapeHtml(row.label)}</span>
              </div>
              <span class="text-sm font-semibold text-ink">${row.wins} win${row.wins === 1 ? "" : "s"}</span>
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
      const [tournament, playerData] = await Promise.all([
        fetchJson(`${API_URL}?id=${encodeURIComponent(id)}`),
        fetchJson(PLAYERS_API_URL),
      ]);
      const players = Array.isArray(playerData) ? playerData : [];
      renderSummary(tournament, players);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load summary.";
      pageStatus.classList.remove("hidden");
      summaryPanel.classList.add("hidden");
    }
  }

  loadSummary();
})();
