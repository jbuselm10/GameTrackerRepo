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
  const addingWinnerPlayIds = new Set();
  const dirtyWinnerSelects = new Set();
  const pendingWinnerValues = {};

  function assignWinnerKey(playId) {
    return `assign:${playId}`;
  }

  function updateWinnerKey(playId, index) {
    return `update:${playId}:${index}`;
  }

  function addWinnerKey(playId) {
    return `add:${playId}`;
  }

  function winnerSelectPendingClass(key, selectedId) {
    return dirtyWinnerSelects.has(key) && selectedId ? " gt-pending" : "";
  }

  function clearWinnerPendingForPlay(playId) {
    dirtyWinnerSelects.delete(assignWinnerKey(playId));
    dirtyWinnerSelects.delete(addWinnerKey(playId));
    delete pendingWinnerValues[assignWinnerKey(playId)];
    delete pendingWinnerValues[addWinnerKey(playId)];
    for (const key of [...dirtyWinnerSelects]) {
      if (key.startsWith(`update:${playId}:`)) {
        dirtyWinnerSelects.delete(key);
      }
    }
    for (const key of Object.keys(pendingWinnerValues)) {
      if (key.startsWith(`update:${playId}:`)) {
        delete pendingWinnerValues[key];
      }
    }
  }

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
    formStatus.classList.remove("hidden", "gt-status-err", "gt-status-ok");
    formStatus.classList.add(isError ? "gt-status-err" : "gt-status-ok");
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

  function buildRosterOptions(rosterIds, selectedId = "", excludeIds = []) {
    const exclude = new Set(excludeIds.filter((id) => id !== selectedId));
    return rosterIds
      .filter((id) => !exclude.has(id))
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}"${id === selectedId ? " selected" : ""}>${escapeHtml(playerLabel(id))}</option>`
      )
      .join("");
  }

  async function savePlayWinners(playId, play, winnerPlayerIds, button, successMessage) {
    if (button) button.disabled = true;
    try {
      await api(API_URL, "PUT", {
        tournamentId: tournament.id,
        playId,
        gameId: play.gameId,
        winnerPlayerIds,
      });
      tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
      renderActive();
      setFormStatus(successMessage);
    } catch (err) {
      setFormStatus(err.message || "Failed to update winners.", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function renderAddWinnerControls(playId, winnerIds, rosterIds) {
    if (!winnerIds.length || winnerIds.length >= MAX_WINNERS_PER_PLAY) {
      return "";
    }
    const availableToAdd = rosterIds.filter((id) => !winnerIds.includes(id));
    if (!availableToAdd.length) {
      return "";
    }

    const inAddMode = addingWinnerPlayIds.has(playId);
    if (!inAddMode) {
      return `
              <button type="button" data-action="show-add-winner" data-play-id="${escapeHtml(playId)}"
                class="gt-btn text-xs">
                Add another winner
              </button>`;
    }

    const pendingId = pendingWinnerValues[addWinnerKey(playId)] || "";
    const pendingClass = winnerSelectPendingClass(addWinnerKey(playId), pendingId);
    return `
            <div class="flex flex-wrap items-center gap-2">
              <select data-add-winner data-play-id="${escapeHtml(playId)}" class="gt-input text-xs${pendingClass}">
                <option value="">Select winner</option>
                ${buildRosterOptions(availableToAdd, pendingId)}
              </select>
              <button type="button" data-action="confirm-add-winner" data-play-id="${escapeHtml(playId)}"
                class="gt-btn text-xs">
                Update Winner
              </button>
            </div>`;
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
    playGame.classList.remove("gt-pending");
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
    if (playWinner) playWinner.value = getPlayWinnerIds(play)[0] || "";
    playFormTitle.textContent = "Edit game";
    savePlayBtn.textContent = "Add game to tournament";
    cancelPlayEditBtn.classList.remove("hidden");
    playGame.focus();
    setFormStatus("");
    playForm.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPlays() {
    const plays = Array.isArray(tournament.plays) ? tournament.plays : [];
    playsTitle.textContent = "Games in the Tournament";

    if (!plays.length) {
      playsList.innerHTML = '<p class="text-sm gt-muted">No games played yet.</p>';
      return;
    }

    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];

    playsList.innerHTML = `
      <ul class="divide-y divide-wood/20">
        ${plays
          .map(
            (play) => {
              const winnerIds = getPlayWinnerIds(play);
              const winnerNamesHtml = winnerIds.length
                ? winnerIds
                    .map((id) => `<span class="font-bold text-ink">${escapeHtml(playerLabel(id))}</span>`)
                    .join(", ")
                : "None yet";
              const addControls = renderAddWinnerControls(play.id, winnerIds, rosterIds);

              let winnerControls = "";
              if (winnerIds.length === 0) {
                const assignKey = assignWinnerKey(play.id);
                const pendingAssignId = pendingWinnerValues[assignKey] || "";
                winnerControls = `
            <div class="flex flex-wrap items-center gap-2">
              <select data-assign-winner data-play-id="${escapeHtml(play.id)}"
                class="gt-input text-xs${winnerSelectPendingClass(assignKey, pendingAssignId)}">
                <option value="">Select winner</option>
                ${buildRosterOptions(rosterIds, pendingAssignId)}
              </select>
              <button type="button" data-action="assign-winner" data-play-id="${escapeHtml(play.id)}"
                class="gt-btn text-xs">
                Update Winner
              </button>
            </div>`;
              } else if (winnerIds.length === 1) {
                const inAddMode = addingWinnerPlayIds.has(play.id);
                if (inAddMode) {
                  winnerControls = renderAddWinnerControls(play.id, winnerIds, rosterIds);
                } else {
                  const assignKey = assignWinnerKey(play.id);
                  const savedAssignId = winnerIds[0];
                  const pendingAssignId = dirtyWinnerSelects.has(assignKey)
                    ? (pendingWinnerValues[assignKey] ?? savedAssignId)
                    : savedAssignId;
                  winnerControls = `
            <div class="flex flex-wrap items-center gap-2">
              <select data-assign-winner data-play-id="${escapeHtml(play.id)}"
                class="gt-input text-xs${winnerSelectPendingClass(assignKey, pendingAssignId)}">
                <option value="">Select winner</option>
                ${buildRosterOptions(rosterIds, pendingAssignId)}
              </select>
              <button type="button" data-action="assign-winner" data-play-id="${escapeHtml(play.id)}"
                class="gt-btn text-xs">
                Update Winner
              </button>
              ${addControls}
            </div>`;
                }
              } else {
                winnerControls = `
            <div class="space-y-2">
              ${winnerIds
                .map((winnerId, index) => {
                  const updateKey = updateWinnerKey(play.id, index);
                  const savedUpdateId = winnerId;
                  const pendingUpdateId = dirtyWinnerSelects.has(updateKey)
                    ? (pendingWinnerValues[updateKey] ?? savedUpdateId)
                    : savedUpdateId;
                  return `
              <div class="flex flex-wrap items-center gap-2">
                <select data-update-winner data-play-id="${escapeHtml(play.id)}" data-winner-index="${index}"
                  class="gt-input text-xs${winnerSelectPendingClass(updateKey, pendingUpdateId)}">
                  ${buildRosterOptions(rosterIds, pendingUpdateId, winnerIds)}
                </select>
                <button type="button" data-action="update-winner" data-play-id="${escapeHtml(play.id)}"
                  data-winner-index="${index}" class="gt-btn text-xs">
                  Update Winner
                </button>
              </div>`;
                })
                .join("")}
              ${addControls}
            </div>`;
              }

              return `
          <li class="space-y-2 py-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-lg font-bold text-ink">${escapeHtml(gameLabel(play.gameId))}</span>
              <div class="flex gap-2">
                <button type="button" data-action="delete-play" data-play-id="${escapeHtml(play.id)}"
                  class="gt-btn-danger text-xs">
                  Remove
                </button>
              </div>
            </div>
            <p class="text-xs gt-muted">
              Winners: ${winnerNamesHtml}
            </p>
            ${winnerControls}
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
      addPlayersList.innerHTML = '<p class="text-sm gt-muted">No players available. Add players first.</p>';
      return;
    }
    addPlayersList.innerHTML = players
      .map((p) => {
        const checked = rosterIds.includes(p.id) ? "checked" : "";
        const label = p.nickname ? `${p.name} (${p.nickname})` : p.name;
        return `
          <label class="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="player" value="${escapeHtml(p.id)}" ${checked}
              class="rounded border-wood/40 text-felt focus:ring-felt/30" />
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
    playersStatus.classList.remove("hidden", "gt-status-err", "gt-status-ok");
    playersStatus.classList.add(isError ? "gt-status-err" : "gt-status-ok");
  }

  function renderActive() {
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    tournamentName.innerHTML = `${escapeHtml(tournament.name || "Tournament")} <span class="gt-badge-active">Active</span>`;
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
        if (playWinner) playWinner.value = getPlayWinnerIds(play)[0] || "";
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
        ' <a href="tournaments.html" class="underline text-gold-soft">Back to tournaments</a>'
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
          ` <a href="tournament-summary.html?id=${encodeURIComponent(tournament.id)}" class="underline text-gold-soft">View summary</a>` +
            ` · <a href="tournaments.html" class="underline text-gold-soft">Tournaments</a>`
        );
        return;
      }

      if (tournament.status !== "active") {
        showMessageState(
          "This tournament is not active.",
          ' <a href="tournaments.html" class="underline text-gold-soft">Back to tournaments</a>'
        );
        return;
      }

      renderActive();
    } catch (err) {
      showMessageState(
        err.message || "Failed to load tournament.",
        ' <a href="tournaments.html" class="underline text-gold-soft">Back to tournaments</a>'
      );
    }
  }

  playGame.addEventListener("change", () => {
    if (playGame.value) {
      playGame.classList.add("gt-pending");
    } else {
      playGame.classList.remove("gt-pending");
    }
  });

  playForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tournament) return;

    const gameId = playGame.value;
    const winnerPlayerIds = playWinner && playWinner.value ? [playWinner.value] : [];
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
          winnerPlayerIds,
        });
        setFormStatus("Game updated.");
      } else {
        await api(API_URL, "POST", {
          tournamentId: tournament.id,
          gameId,
          winnerPlayerIds: [],
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

  playsList.addEventListener("change", (event) => {
    const select = event.target.closest(
      "select[data-assign-winner], select[data-add-winner], select[data-update-winner]"
    );
    if (!select) return;

    const playId = select.getAttribute("data-play-id");
    let pendingKey = "";
    if (select.matches("select[data-assign-winner]")) {
      pendingKey = assignWinnerKey(playId);
    } else if (select.matches("select[data-update-winner]")) {
      pendingKey = updateWinnerKey(playId, select.getAttribute("data-winner-index"));
    } else if (select.matches("select[data-add-winner]")) {
      pendingKey = addWinnerKey(playId);
    }

    if (select.value) {
      pendingWinnerValues[pendingKey] = select.value;
      dirtyWinnerSelects.add(pendingKey);
    } else {
      delete pendingWinnerValues[pendingKey];
      dirtyWinnerSelects.delete(pendingKey);
    }

    if (select.matches("select[data-add-winner]")) {
      renderPlays();
      return;
    }

    select.classList.toggle("gt-pending", dirtyWinnerSelects.has(pendingKey) && !!select.value);
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
      const selectedId = select ? select.value : "";
      if (!selectedId) {
        setFormStatus("Select a winner to assign.", true);
        return;
      }

      const existing = getPlayWinnerIds(play);
      if (!existing.length) {
        dirtyWinnerSelects.delete(assignWinnerKey(playId));
        delete pendingWinnerValues[assignWinnerKey(playId)];
        await savePlayWinners(playId, play, [selectedId], button, "Winner assigned.");
        return;
      }
      if (existing.includes(selectedId) && existing[0] !== selectedId) {
        setFormStatus("That player is already a winner for this game.", true);
        return;
      }
      const winnerPlayerIds = [selectedId, ...existing.slice(1)];
      dirtyWinnerSelects.delete(assignWinnerKey(playId));
      delete pendingWinnerValues[assignWinnerKey(playId)];
      await savePlayWinners(playId, play, winnerPlayerIds, button, "Winner updated.");
      return;
    }

    if (action === "update-winner") {
      const winnerIndex = Number(button.getAttribute("data-winner-index"));
      if (!Number.isInteger(winnerIndex) || winnerIndex < 0) {
        return;
      }
      const updateKey = updateWinnerKey(playId, winnerIndex);
      const select = playsList.querySelector(
        `select[data-update-winner][data-play-id="${playId}"][data-winner-index="${winnerIndex}"]`
      );
      const selectedId = select ? select.value : "";
      if (!selectedId) {
        setFormStatus("Select a winner to assign.", true);
        return;
      }

      const existing = getPlayWinnerIds(play);
      if (!existing[winnerIndex]) {
        setFormStatus("Winner slot not found.", true);
        return;
      }
      if (existing.includes(selectedId) && existing[winnerIndex] !== selectedId) {
        setFormStatus("That player is already a winner for this game.", true);
        return;
      }
      const winnerPlayerIds = [...existing];
      winnerPlayerIds[winnerIndex] = selectedId;
      dirtyWinnerSelects.delete(updateKey);
      delete pendingWinnerValues[updateKey];
      await savePlayWinners(playId, play, winnerPlayerIds, button, "Winner updated.");
      return;
    }

    if (action === "show-add-winner") {
      addingWinnerPlayIds.add(playId);
      dirtyWinnerSelects.delete(addWinnerKey(playId));
      delete pendingWinnerValues[addWinnerKey(playId)];
      renderPlays();
      setFormStatus("Select another winner from the list.");
      return;
    }

    if (action === "confirm-add-winner") {
      const existing = getPlayWinnerIds(play);
      if (!existing.length) {
        setFormStatus("Assign the first winner with Update Winner.", true);
        return;
      }
      if (existing.length >= MAX_WINNERS_PER_PLAY) {
        setFormStatus(`A game can have at most ${MAX_WINNERS_PER_PLAY} winners.`, true);
        return;
      }

      const select = playsList.querySelector(`select[data-add-winner][data-play-id="${playId}"]`);
      const addKey = addWinnerKey(playId);
      const selectedId = (select && select.value) || pendingWinnerValues[addKey] || "";
      if (!selectedId) {
        setFormStatus("Select a winner to add.", true);
        return;
      }
      if (existing.includes(selectedId)) {
        setFormStatus("That player is already a winner for this game.", true);
        return;
      }

      addingWinnerPlayIds.delete(playId);
      dirtyWinnerSelects.delete(addKey);
      delete pendingWinnerValues[addKey];
      await savePlayWinners(playId, play, [...existing, selectedId], button, "Winner added.");
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
        addingWinnerPlayIds.delete(playId);
        clearWinnerPendingForPlay(playId);
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
    newGameStatus.classList.remove("hidden", "gt-status-err", "gt-status-ok");
    newGameStatus.classList.add(isError ? "gt-status-err" : "gt-status-ok");
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

  addPlayersList.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[name="player"]');
    if (!checkbox || !tournament) return;
    const rosterIds = Array.isArray(tournament.playerIds) ? tournament.playerIds : [];
    const savedChecked = rosterIds.includes(checkbox.value);
    if (checkbox.checked !== savedChecked) {
      checkbox.classList.add("gt-pending");
    } else {
      checkbox.classList.remove("gt-pending");
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
