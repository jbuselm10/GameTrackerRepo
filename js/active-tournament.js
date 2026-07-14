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
  const playWinner = document.getElementById("play-winner"); // may be null if form simplified
  const savePlayBtn = document.getElementById("save-play-btn");
  const cancelPlayEditBtn = document.getElementById("cancel-play-edit-btn");
  const endTournamentBtn = document.getElementById("end-tournament-btn");
  const addPlayersList = document.getElementById("add-players-list");
  const savePlayersBtn = document.getElementById("save-players-btn");
  const playersStatus = document.getElementById("players-status");
  const newGameForm = document.getElementById("new-game-form");
  const newGameNameInput = document.getElementById("new-game-name");
  const newGameStatus = document.getElementById("new-game-status");

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
      const sorted = [...games].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
      );
      playGame.innerHTML =
        '<option value="">Select game</option>' +
        sorted
          .map(
            (game) =>
              `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`
          )
          .join("");
    }

    if (playWinner) {
      if (!rosterIds.length) {
        playWinner.innerHTML = '<option value="">No players in tournament</option>';
      } else {
        playWinner.innerHTML =
          '<option value="">— No winner —</option>' +
          rosterIds
            .map(
              (id) =>
                `<option value="${escapeHtml(id)}">${escapeHtml(playerLabel(id))}</option>`
            )
            .join("");
      }
    }
  }

  function resetPlayForm() {
    editingPlayId = null;
    playIdInput.value = "";
    playGame.value = "";
    if (playWinner) playWinner.value = "";
    playFormTitle.textContent = "Add a Game to the Tournament";
    savePlayBtn.textContent = "Add game to tournament";
    cancelPlayEditBtn.classList.add("hidden");
  }

  function startEditPlay(play) {
    editingPlayId = play.id;
    playIdInput.value = play.id;
    fillSelects();
    playGame.value = play.gameId || "";
    if (playWinner) playWinner.value = play.winnerPlayerId || "";
    playFormTitle.textContent = "Edit game";
    savePlayBtn.textContent = "Add game to tournament";
    cancelPlayEditBtn.classList.remove("hidden");
    playGame.focus();
    setFormStatus("");
    playForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlays() {
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    const allHaveWinner = plays.length > 0 && plays.every((p) => p.winnerPlayerId);
    playsTitle.textContent = !plays.length
      ? "Games in the Tournament"
      : allHaveWinner
        ? "Completed Games with Winner"
        : "Games in the Tournament";

    if (!plays.length) {
      playsList.innerHTML = '<p class="text-sm text-slate-500">No games played yet.</p>';
      return;
    }

    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    const rosterOptions = rosterIds
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}">${escapeHtml(playerLabel(id))}</option>`
      )
      .join("");

    playsList.innerHTML = `
      <ul class="divide-y divide-slate-100">
        ${plays
          .map(
            (play) => {
              const winnerSelectOptions = rosterIds
                .map(
                  (id) =>
                    `<option value="${escapeHtml(id)}"${id === play.winnerPlayerId ? ' selected' : ''}>${escapeHtml(playerLabel(id))}</option>`
                )
                .join("");
              return `
          <li class="space-y-2 py-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm font-medium text-slate-900">${escapeHtml(gameLabel(play.gameId))}</span>
              <div class="flex gap-2">
                <button type="button" data-action="delete-play" data-play-id="${escapeHtml(play.id)}"
                  class="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                  Remove
                </button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <select data-assign-winner data-play-id="${escapeHtml(play.id)}"
                class="rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 ${play.winnerPlayerId ? 'text-slate-900' : 'text-red-600'}"
                onchange="this.classList.toggle('text-red-600', !this.value); this.classList.toggle('text-slate-900', !!this.value);">
                <option value="">Select winner</option>
                ${winnerSelectOptions}
              </select>
              <button type="button" data-action="assign-winner" data-play-id="${escapeHtml(play.id)}"
                class="rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700">
                Update Winner
              </button>
            </div>
          </li>`;
            }
          )
          .join("")}
      </ul>
    `;
  }

  function renderPlayerCheckboxes() {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    if (!players.length) {
      addPlayersList.innerHTML = '<p class="text-sm text-slate-500">No players available. Add players first.</p>';
      return;
    }
    addPlayersList.innerHTML = players
      .map((p) => {
        const checked = rosterIds.includes(p.id) ? "checked" : "";
        const label = p.nickname ? `${p.name} (${p.nickname})` : p.name;
        return `
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" name="player" value="${escapeHtml(p.id)}" ${checked}
              class="rounded border-slate-300 text-slate-900 focus:ring-slate-200" />
            ${escapeHtml(label)}
          </label>`;
      })
      .join("");
  }

  function setPlayersStatus(message, isError = false) {
    if (!message) {
      playersStatus.classList.add("hidden");
      playersStatus.textContent = "";
      return;
    }
    playersStatus.textContent = message;
    playersStatus.classList.remove("hidden", "text-red-600", "text-emerald-700");
    playersStatus.classList.add(isError ? "text-red-600" : "text-emerald-700");
  }

  function renderActive() {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    tournamentName.innerHTML = `${escapeHtml(tournament.name || "Tournament")} <span class="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-800">Active</span>`;
    tournamentDate.textContent = formatDate(tournament.date);
    tournamentPlayers.textContent = rosterIds.length
      ? `Players: ${rosterIds.map((id) => playerLabel(id)).join(", ")}`
      : "No players";

    const goToPlayersLink = document.getElementById("go-to-players-link");
    if (goToPlayersLink) {
      goToPlayersLink.href = `players.html?returnTo=${encodeURIComponent(window.location.href)}`;
    }

    fillSelects();
    renderPlays();
    renderPlayerCheckboxes();
    if (editingPlayId) {
      const play = (tournament.plays || []).find((p) => p.id === editingPlayId);
      if (play) {
        playGame.value = play.gameId || "";
        if (playWinner) playWinner.value = play.winnerPlayerId || "";
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
    const winnerPlayerId = playWinner ? playWinner.value : "";
    if (!gameId) {
      setFormStatus("Select a game.", true);
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
          winnerPlayerId: winnerPlayerId || "",
        });
        setFormStatus("Game updated.");
      } else {
        await api(API_URL, "POST", {
          tournamentId: tournament.id,
          gameId,
          winnerPlayerId: "",
        });
        setFormStatus("Game added to tournament.");
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

    if (action === "assign-winner") {
      const select = playsList.querySelector(`select[data-assign-winner][data-play-id="${playId}"]`);
      const winnerPlayerId = select ? select.value : "";
      if (!winnerPlayerId) {
        setFormStatus("Select a winner to assign.", true);
        return;
      }
      button.disabled = true;
      try {
        await api(API_URL, "PUT", {
          tournamentId: tournament.id,
          playId,
          gameId: play.gameId,
          winnerPlayerId,
        });
        tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
        renderActive();
        setFormStatus("Winner assigned.");
      } catch (err) {
        setFormStatus(err.message || "Failed to assign winner.", true);
      } finally {
        button.disabled = false;
      }
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

  function setNewGameStatus(message, isError = false) {
    if (!message) {
      newGameStatus.classList.add("hidden");
      newGameStatus.textContent = "";
      return;
    }
    newGameStatus.textContent = message;
    newGameStatus.classList.remove("hidden", "text-red-600", "text-emerald-700");
    newGameStatus.classList.add(isError ? "text-red-600" : "text-emerald-700");
  }

  newGameForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = newGameNameInput.value.trim();
    if (!name) {
      setNewGameStatus("Enter a game name.", true);
      return;
    }
    try {
      await api(GAMES_API_URL, "POST", { name });
      newGameNameInput.value = "";
      setNewGameStatus(`Game "${name}" added.`);
      games = await api(GAMES_API_URL, "GET");
      if (!Array.isArray(games)) games = [];
      fillSelects();
    } catch (err) {
      setNewGameStatus(err.message || "Failed to add game.", true);
    }
  });

  savePlayersBtn.addEventListener("click", async () => {
    if (!tournament) return;
    const checked = Array.from(addPlayersList.querySelectorAll('input[name="player"]:checked'))
      .map((cb) => cb.value);
    if (!checked.length) {
      setPlayersStatus("Select at least one player.", true);
      return;
    }
    savePlayersBtn.disabled = true;
    setPlayersStatus("");
    try {
      await api(API_URL, "PUT", {
        id: tournament.id,
        name: tournament.name,
        date: tournament.date,
        status: tournament.status,
        playerIds: checked,
      });
      tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
      renderActive();
      setPlayersStatus("Players updated.");
    } catch (err) {
      setPlayersStatus(err.message || "Failed to update players.", true);
    } finally {
      savePlayersBtn.disabled = false;
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
