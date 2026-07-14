(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const GAMES_API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const formStatus = document.getElementById("form-status");
  const activePanel = document.getElementById("active-panel");
  const tournamentName = document.getElementById("tournament-name");
  const tournamentDate = document.getElementById("tournament-date");
  const tournamentPlayers = document.getElementById("tournament-players");
  const playsList = document.getElementById("plays-list");
  const playsTitle = document.getElementById("plays-title");
  const playForm = document.getElementById("play-form");
  const playFormTitle = document.getElementById("play-form-title");
  const playIdInput = document.getElementById("play-id");
  const playGame = document.getElementById("play-game");
  const playWinner = document.getElementById("play-winner");
  const savePlayBtn = document.getElementById("save-play-btn");
  const cancelPlayEditBtn = document.getElementById("cancel-play-edit-btn");
  const endTournamentBtn = document.getElementById("end-tournament-btn");

  let tournament = null;
  let players = [];
  let games = [];
  let editingPlayId = null;

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

  function getQueryId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function setFormStatus(message, isError = false) {
    if (!message) {
      formStatus.classList.add("hidden");
      formStatus.textContent = "";
      return;
    }
    formStatus.textContent = message;
    formStatus.classList.remove("hidden", "text-red-600", "text-emerald-700");
    formStatus.classList.add(isError ? "text-red-600" : "text-emerald-700");
  }

  function playerLabel(playerId) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return playerId;
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function gameLabel(gameId) {
    const game = games.find((g) => g.id === gameId);
    return game ? game.name : gameId;
  }

  async function api(url, method, body) {
    const options = {
      method,
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Server returned invalid JSON. Is PHP running?");
      }
    }
    if (!response.ok) {
      const message = (data && data.error) || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  function fillSelects() {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];

    if (!games.length) {
      playGame.innerHTML = '<option value="">No games available</option>';
    } else {
      playGame.innerHTML =
        '<option value="">Select game</option>' +
        games
          .map(
            (game) =>
              `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`
          )
          .join("");
    }

    if (!rosterIds.length) {
      playWinner.innerHTML = '<option value="">No players in tournament</option>';
    } else {
      playWinner.innerHTML =
        '<option value="">Select winner</option>' +
        rosterIds
          .map(
            (id) =>
              `<option value="${escapeHtml(id)}">${escapeHtml(playerLabel(id))}</option>`
          )
          .join("");
    }
  }

  function resetPlayForm() {
    editingPlayId = null;
    playIdInput.value = "";
    playGame.value = "";
    playWinner.value = "";
    playFormTitle.textContent = "Add game";
    savePlayBtn.textContent = "Save game result";
    cancelPlayEditBtn.classList.add("hidden");
  }

  function startEditPlay(play) {
    editingPlayId = play.id;
    playIdInput.value = play.id;
    fillSelects();
    playGame.value = play.gameId || "";
    playWinner.value = play.winnerPlayerId || "";
    playFormTitle.textContent = "Edit game result";
    savePlayBtn.textContent = "Update game result";
    cancelPlayEditBtn.classList.remove("hidden");
    playGame.focus();
    setFormStatus("");
    playForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlays() {
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    playsTitle.textContent = plays.length ? "Completed games" : "Active games";

    if (!plays.length) {
      playsList.innerHTML = '<p class="text-sm text-slate-500">No games played yet.</p>';
      return;
    }

    playsList.innerHTML = `
      <ul class="divide-y divide-slate-100">
        ${plays
          .map(
            (play) => `
          <li class="flex flex-wrap items-center justify-between gap-2 py-2">
            <div class="text-sm">
              <span class="font-medium text-slate-900">${escapeHtml(gameLabel(play.gameId))}</span>
              <span class="text-slate-500"> — Winner: ${escapeHtml(playerLabel(play.winnerPlayerId))}</span>
            </div>
            <div class="flex gap-2">
              <button type="button" data-action="edit-play" data-play-id="${escapeHtml(play.id)}"
                class="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                Edit
              </button>
              <button type="button" data-action="delete-play" data-play-id="${escapeHtml(play.id)}"
                class="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                Remove
              </button>
            </div>
          </li>
        `
          )
          .join("")}
      </ul>
    `;
  }

  function renderActive() {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    tournamentName.textContent = tournament.name || "Tournament";
    tournamentDate.textContent = formatDate(tournament.date);
    tournamentPlayers.textContent = rosterIds.length
      ? `Players: ${rosterIds.map((id) => playerLabel(id)).join(", ")}`
      : "No players";

    fillSelects();
    renderPlays();
    if (editingPlayId) {
      const play = (tournament.plays || []).find((p) => p.id === editingPlayId);
      if (play) {
        playGame.value = play.gameId || "";
        playWinner.value = play.winnerPlayerId || "";
      } else {
        resetPlayForm();
      }
    }
    pageStatus.classList.add("hidden");
    activePanel.classList.remove("hidden");
  }

  function showMessageState(message, linksHtml = "") {
    activePanel.classList.add("hidden");
    pageStatus.classList.remove("hidden");
    pageStatus.innerHTML = `${escapeHtml(message)}${linksHtml}`;
  }

  async function loadPage() {
    const id = getQueryId();
    if (!id) {
      showMessageState(
        "Missing tournament id.",
        ' <a href="tournaments.html" class="text-slate-700 underline">Back to tournaments</a>'
      );
      return;
    }

    pageStatus.textContent = "Loading tournament…";
    pageStatus.classList.remove("hidden");
    activePanel.classList.add("hidden");

    try {
      const [tournamentData, playerData, gameData] = await Promise.all([
        api(`${API_URL}?id=${encodeURIComponent(id)}`, "GET"),
        api(PLAYERS_API_URL, "GET"),
        api(GAMES_API_URL, "GET"),
      ]);

      tournament = tournamentData;
      players = Array.isArray(playerData) ? playerData : [];
      games = Array.isArray(gameData) ? gameData : [];

      if (tournament.status === "ended") {
        showMessageState(
          "This tournament has ended.",
          ` <a href="tournament-summary.html?id=${encodeURIComponent(tournament.id)}" class="text-slate-700 underline">View summary</a>` +
            ` · <a href="tournaments.html" class="text-slate-700 underline">Tournaments</a>`
        );
        return;
      }

      if (tournament.status !== "active") {
        showMessageState(
          "This tournament is not active.",
          ' <a href="tournaments.html" class="text-slate-700 underline">Back to tournaments</a>'
        );
        return;
      }

      renderActive();
    } catch (err) {
      showMessageState(
        err.message || "Failed to load tournament.",
        ' <a href="tournaments.html" class="text-slate-700 underline">Back to tournaments</a>'
      );
    }
  }

  playForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tournament) return;

    const gameId = playGame.value;
    const winnerPlayerId = playWinner.value;
    if (!gameId || !winnerPlayerId) {
      setFormStatus("Select a game and a winner.", true);
      return;
    }

    savePlayBtn.disabled = true;
    setFormStatus("");
    try {
      if (editingPlayId) {
        await api(API_URL, "PUT", {
          tournamentId: tournament.id,
          playId: editingPlayId,
          gameId,
          winnerPlayerId,
        });
        setFormStatus("Game result updated.");
      } else {
        await api(API_URL, "POST", {
          tournamentId: tournament.id,
          gameId,
          winnerPlayerId,
        });
        setFormStatus("Game result saved.");
      }
      tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
      resetPlayForm();
      renderActive();
    } catch (err) {
      setFormStatus(err.message || "Failed to save game result.", true);
    } finally {
      savePlayBtn.disabled = false;
    }
  });

  cancelPlayEditBtn.addEventListener("click", () => {
    resetPlayForm();
    fillSelects();
    setFormStatus("");
  });

  playsList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !tournament) return;

    const playId = button.getAttribute("data-play-id");
    const action = button.getAttribute("data-action");
    const play = (tournament.plays || []).find((p) => p.id === playId);
    if (!play) return;

    if (action === "edit-play") {
      startEditPlay(play);
      return;
    }

    if (action === "delete-play") {
      if (!window.confirm("Remove this game result?")) {
        return;
      }
      try {
        await api(API_URL, "DELETE", {
          tournamentId: tournament.id,
          playId,
        });
        if (editingPlayId === playId) {
          resetPlayForm();
        }
        tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
        renderActive();
        setFormStatus("Game result removed.");
      } catch (err) {
        setFormStatus(err.message || "Failed to remove game result.", true);
      }
    }
  });

  endTournamentBtn.addEventListener("click", async () => {
    if (!tournament) return;
    if (!window.confirm(`End ${tournament.name}?`)) {
      return;
    }

    endTournamentBtn.disabled = true;
    setFormStatus("");
    try {
      await api(API_URL, "PUT", {
        id: tournament.id,
        name: tournament.name,
        date: tournament.date,
        status: "ended",
        playerIds: Array.isArray(tournament.playerIds) ? tournament.playerIds : [],
      });
      window.location.href = `tournament-summary.html?id=${encodeURIComponent(tournament.id)}`;
    } catch (err) {
      endTournamentBtn.disabled = false;
      setFormStatus(err.message || "End failed.", true);
    }
  });

  loadPage();
})();
