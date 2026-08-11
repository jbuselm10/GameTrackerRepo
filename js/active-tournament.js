(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";
  const GAMES_API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const formStatus = document.getElementById("form-status");
  const activePanel = document.getElementById("active-panel");
  const tournamentName = document.getElementById("tournament-name");
  const tournamentDate = document.getElementById("tournament-date");
  const tournamentScoring = document.getElementById("tournament-scoring");
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
  const currentStandingsLink = document.getElementById("current-standings-link");
  const addPlayersList = document.getElementById("add-players-list");
  const savePlayersBtn = document.getElementById("save-players-btn");
  const playersStatus = document.getElementById("players-status");
  const rosterPanelTitle = document.getElementById("roster-panel-title");
  const goToCompetitorsLink = document.getElementById("go-to-players-link");
  const newGameForm = document.getElementById("new-game-form");
  const newGameNameInput = document.getElementById("new-game-name");
  const newGameStatus = document.getElementById("new-game-status");
  const newGamePanel = document.getElementById("new-game-panel");
  const newGameHeading = document.getElementById("new-game-heading");
  const newGameBtn = document.getElementById("new-game-btn");
  const showNewGameBtn = document.getElementById("show-new-game-btn");
  const playFormPanel = document.getElementById("play-form-panel");

  let tournament = null;
  let players = [];
  let teams = [];
  let competitorLabel = (id) => id;
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = GameTracker.api.bind(GameTracker);
  let games = [];
  let editingPlayId = null;
  let showNewGameForm = false;
  const addingWinnerPlayIds = new Set();
  const dirtyWinnerSelects = new Set();
  const pendingWinnerValues = {};

  function refreshCompetitorLabeler() {
    competitorLabel = buildCompetitorLabeler(tournament, players, teams);
  }

  function isTeamTournament() {
    return getCompetitorType(tournament) === "team";
  }

  function competitorNoun(plural = false) {
    if (isTeamTournament()) {
      return plural ? "teams" : "team";
    }
    return plural ? "players" : "player";
  }

  function competitorNounCap(plural = false) {
    const n = competitorNoun(plural);
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

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

  function winnerButtonPendingClass(key, selectedId) {
    return dirtyWinnerSelects.has(key) && selectedId ? " gt-btn-highlight gt-btn-warn" : "";
  }

  function syncWinnerButtonHighlight(select) {
    if (!select) return;
    const isPending = select.classList.contains("gt-pending");
    let button = null;
    if (select.matches("select[data-assign-winner]")) {
      button = select
        .closest("div")
        ?.querySelector(`button[data-action="assign-winner"][data-play-id="${select.getAttribute("data-play-id")}"]`);
    } else if (select.matches("select[data-add-winner]")) {
      button = select
        .closest("div")
        ?.querySelector(`button[data-action="confirm-add-winner"][data-play-id="${select.getAttribute("data-play-id")}"]`);
    } else if (select.matches("select[data-update-winner]")) {
      const playId = select.getAttribute("data-play-id");
      const index = select.getAttribute("data-winner-index");
      button = select
        .closest("div")
        ?.querySelector(
          `button[data-action="update-winner"][data-play-id="${playId}"][data-winner-index="${index}"]`
        );
    }
    if (!button) return;
    button.classList.toggle("gt-btn-highlight", isPending);
    button.classList.toggle("gt-btn-warn", isPending);
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
    return competitorLabel(playerId);
  }

  function gameLabel(gameId) {
    const game = games.find((g) => g.id === gameId);
    return game ? game.name : gameId;
  }

  function buildRosterOptions(rosterIds, selectedId = "", excludeIds = []) {
    const exclude = new Set(excludeIds.filter((id) => id !== selectedId));
    return GameTracker.sortByName(
      rosterIds.filter((id) => !exclude.has(id)),
      (id) => competitorLabel(id)
    )
      .map(
        (id) =>
          `<option value="${escapeHtml(id)}"${id === selectedId ? " selected" : ""}>${escapeHtml(competitorLabel(id))}</option>`
      )
      .join("");
  }

  function placementKey(playId, index) {
    return `place:${playId}:${index}`;
  }

  async function savePlayWinners(playId, play, winnerPlayerIds, button, successMessage) {
    if (button) button.disabled = true;
    try {
      await api(API_URL, "PUT", {
        tournamentId: tournament.id,
        playId,
        gameId: play.gameId,
        winnerIds: winnerPlayerIds,
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

  async function savePlayPlacements(playId, play, placementPlayerIds, button, successMessage) {
    if (button) button.disabled = true;
    try {
      await api(API_URL, "PUT", {
        tournamentId: tournament.id,
        playId,
        gameId: play.gameId,
        placementIds: placementPlayerIds,
      });
      clearWinnerPendingForPlay(playId);
      for (let i = 0; i < MAX_PLACEMENTS_PER_PLAY; i++) {
        dirtyWinnerSelects.delete(placementKey(playId, i));
        delete pendingWinnerValues[placementKey(playId, i)];
      }
      tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
      renderActive();
      setFormStatus(successMessage);
    } catch (err) {
      setFormStatus(err.message || "Failed to update placements.", true);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function collectPlacementIdsFromUi(playId, savedPlacements) {
    const ids = [];
    for (let index = 0; index < MAX_PLACEMENTS_PER_PLAY; index++) {
      const key = placementKey(playId, index);
      const select = playsList.querySelector(
        `select[data-placement][data-play-id="${playId}"][data-place-index="${index}"]`
      );
      let value = "";
      if (dirtyWinnerSelects.has(key)) {
        value = pendingWinnerValues[key] || "";
      } else if (select) {
        value = select.value || "";
      } else {
        value = savedPlacements[index] || "";
      }
      if (value) ids.push(value);
    }
    return ids;
  }

  function renderPlacementControls(play, rosterIds) {
    const saved = getPlayPlacementIds(play);
    const labels = PLACE_LABELS;
    const points = POINTS_BY_PLACE;

    return `
      <div class="space-y-2">
        ${labels
          .map((label, index) => {
            const key = placementKey(play.id, index);
            const savedId = saved[index] || "";
            const pendingId = dirtyWinnerSelects.has(key)
              ? (pendingWinnerValues[key] ?? savedId)
              : savedId;
            const currentSelections = labels.map((_, i) => {
              const k = placementKey(play.id, i);
              if (dirtyWinnerSelects.has(k)) return pendingWinnerValues[k] || "";
              return saved[i] || "";
            });
            const exclude = currentSelections.filter((id, i) => id && i !== index);
            return `
          <div class="flex flex-wrap items-center gap-2">
            <span class="w-24 text-sm font-bold text-ink">${label} (+${points[index]})</span>
            <select data-placement data-play-id="${escapeHtml(play.id)}" data-place-index="${index}"
              class="gt-input${winnerSelectPendingClass(key, pendingId)}">
              <option value="">— None —</option>
              ${buildRosterOptions(rosterIds, pendingId, exclude)}
            </select>
          </div>`;
          })
          .join("")}
        <button type="button" data-action="save-placements" data-play-id="${escapeHtml(play.id)}"
          class="gt-btn text-sm">
          Update placements
        </button>
      </div>`;
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
                class="gt-btn text-sm">
                Add an Additional Winner
              </button>`;
    }

    const pendingId = pendingWinnerValues[addWinnerKey(playId)] || "";
    const pendingClass = winnerSelectPendingClass(addWinnerKey(playId), pendingId);
    const buttonPendingClass = winnerButtonPendingClass(addWinnerKey(playId), pendingId);
    return `
            <div class="flex flex-wrap items-center gap-2">
              <select data-add-winner data-play-id="${escapeHtml(playId)}" class="gt-input${pendingClass}">
                <option value="">Select winner</option>
                ${buildRosterOptions(availableToAdd, pendingId)}
              </select>
              <button type="button" data-action="confirm-add-winner" data-play-id="${escapeHtml(playId)}"
                class="gt-btn text-sm${buttonPendingClass}">
                Update Winner
              </button>
            </div>`;
  }

  function fillSelects() {
    const rosterIds = rosterIdsFromTournament(tournament);
    const hasGames = games.length > 0;
    // When games exist, only show the new-game form after the user asks for it.
    // When the catalog is empty, the form must stay open so they can add the first game.
    const showNewGame = !hasGames || showNewGameForm;

    if (playFormPanel) {
      playFormPanel.classList.toggle("hidden", !hasGames);
    }
    if (showNewGameBtn) {
      showNewGameBtn.classList.toggle("hidden", !hasGames || showNewGameForm);
    }
    if (newGamePanel) {
      newGamePanel.classList.toggle("hidden", !showNewGame);
      newGamePanel.classList.toggle("gt-edit-highlight", !hasGames);
    }
    if (newGameHeading) {
      newGameHeading.classList.toggle("text-base", !hasGames);
      newGameHeading.textContent = hasGames
        ? "New Game Name"
        : "No games available. Add a game to the tournament.";
    }
    syncNewGameBtnHighlight();

    const prevGameId = playGame.value;
    if (!hasGames) {
      playGame.innerHTML = '<option value="">Add a game to the tournament</option>';
    } else {
      const sorted = GameTracker.sortByName(games);
      playGame.innerHTML =
        '<option value="">Select game</option>' +
        sorted
          .map(
            (game) =>
              `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`
          )
          .join("");
      if (prevGameId) playGame.value = prevGameId;
    }
    playGame.classList.toggle("gt-pending", !editingPlayId && !!playGame.value);

    if (playWinner) {
      if (!rosterIds.length) {
        playWinner.innerHTML = `<option value="">No ${competitorNoun(true)} in tournament</option>`;
      } else {
        playWinner.innerHTML =
          '<option value="">— No winner —</option>' +
          GameTracker.sortByName(rosterIds, (id) => competitorLabel(id))
            .map(
              (id) =>
                `<option value="${escapeHtml(id)}">${escapeHtml(competitorLabel(id))}</option>`
            )
            .join("");
      }
    }
    syncSavePlayBtnHighlight();
  }

  function resetPlayForm() {
    editingPlayId = null;
    playIdInput.value = "";
    playGame.value = "";
    playGame.classList.remove("gt-pending");
    syncSavePlayBtnHighlight();
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
    playsTitle.textContent =
      plays.length > 1
        ? `Games in the Tournament (${plays.length})`
        : "Games in the Tournament";
    const scoringMode = getScoringMode(tournament);

    if (!plays.length) {
      playsList.innerHTML = '<p class="text-sm gt-muted">No games played yet.</p>';
      return;
    }

    const incompletePlays = [];
    const completedPlays = [];
    for (const play of plays) {
      const done =
        scoringMode === "points"
          ? getPlayPlacementIds(play).length > 0
          : getPlayWinnerIds(play).length > 0;
      if (done) {
        completedPlays.push(play);
      } else {
        incompletePlays.push(play);
      }
    }
    const sortedPlays = incompletePlays.concat(completedPlays);

    const rosterIds = rosterIdsFromTournament(tournament);

    if (scoringMode === "points") {
      playsList.innerHTML = `
      <ul class="divide-y divide-wood/20">
        ${sortedPlays
          .map((play) => {
            const placements = getPlayPlacementIds(play);
            const placementSummary = placements.length
              ? placements
                  .map(
                    (id, index) =>
                      `${PLACE_LABELS[index]}: <span class="font-bold text-ink">${escapeHtml(competitorLabel(id))}</span>`
                  )
                  .join(", ")
              : "None yet";
            return `
          <li class="space-y-2 py-2">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-lg font-bold text-ink">${escapeHtml(gameLabel(play.gameId))}</span>
              <div class="flex gap-2">
                <button type="button" data-action="delete-play" data-play-id="${escapeHtml(play.id)}"
                  class="gt-btn-danger text-sm">
                  Remove
                </button>
              </div>
            </div>
            <p class="text-xs gt-muted">
              Places: ${placementSummary}
            </p>
            ${renderPlacementControls(play, rosterIds)}
          </li>`;
          })
          .join("")}
      </ul>
    `;
      return;
    }

    playsList.innerHTML = `
      <ul class="divide-y divide-wood/20">
        ${sortedPlays
          .map(
            (play) => {
              const winnerIds = getPlayWinnerIds(play);
              const winnerNamesHtml = winnerIds.length
                ? winnerIds
                    .map((id) => `<span class="font-bold text-ink">${escapeHtml(competitorLabel(id))}</span>`)
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
                class="gt-input${winnerSelectPendingClass(assignKey, pendingAssignId)}">
                <option value="">Select winner</option>
                ${buildRosterOptions(rosterIds, pendingAssignId)}
              </select>
              <button type="button" data-action="assign-winner" data-play-id="${escapeHtml(play.id)}"
                class="gt-btn text-sm${winnerButtonPendingClass(assignKey, pendingAssignId)}">
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
                class="gt-input${winnerSelectPendingClass(assignKey, pendingAssignId)}">
                <option value="">Select winner</option>
                ${buildRosterOptions(rosterIds, pendingAssignId)}
              </select>
              <button type="button" data-action="assign-winner" data-play-id="${escapeHtml(play.id)}"
                class="gt-btn text-sm${winnerButtonPendingClass(assignKey, pendingAssignId)}">
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
                  class="gt-input${winnerSelectPendingClass(updateKey, pendingUpdateId)}">
                  ${buildRosterOptions(rosterIds, pendingUpdateId, winnerIds)}
                </select>
                <button type="button" data-action="update-winner" data-play-id="${escapeHtml(play.id)}"
                  data-winner-index="${index}" class="gt-btn text-sm${winnerButtonPendingClass(updateKey, pendingUpdateId)}">
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
                  class="gt-btn-danger text-sm">
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
    const rosterIds = rosterIdsFromTournament(tournament);
    const options = isTeamTournament() ? teams : players;
    const nounPlural = competitorNoun(true);

    if (!options.length) {
      addPlayersList.innerHTML = `<p class="text-sm gt-muted">No ${nounPlural} available. Add ${nounPlural} first.</p>`;
      syncSavePlayersBtnHighlight();
      return;
    }
    addPlayersList.innerHTML = GameTracker.sortByName(options)
      .map((item) => {
        const checked = rosterIds.includes(item.id) ? "checked" : "";
        const label = isTeamTournament()
          ? item.name
          : item.nickname
            ? `${item.name} (${item.nickname})`
            : item.name;
        return `
          <label class="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" name="player" value="${escapeHtml(item.id)}" ${checked}
              class="rounded border-wood/40 text-felt focus:ring-felt/30" />
            ${escapeHtml(label)}
          </label>`;
      })
      .join("");
    syncPlayerCheckboxStyles();
  }

  function syncPlayerCheckboxStyles() {
    if (!tournament) return;
    GameTracker.syncPlayerCheckboxStyles(addPlayersList, rosterIdsFromTournament(tournament), {
      active: true,
      inputSelector: 'input[name="player"]',
      getPlayerId: (input) => input.value,
    });
    syncSavePlayersBtnHighlight();
  }

  function syncSavePlayersBtnHighlight() {
    if (!savePlayersBtn) return;
    const hasPending = !!addPlayersList.querySelector('input[name="player"].gt-pending');
    savePlayersBtn.classList.toggle("gt-btn-highlight", hasPending);
    savePlayersBtn.classList.toggle("gt-btn-warn", hasPending);
  }

  function syncSavePlayBtnHighlight() {
    if (!savePlayBtn) return;
    const pending = playGame.classList.contains("gt-pending") && !!playGame.value;
    savePlayBtn.classList.toggle("gt-btn-highlight", pending);
    savePlayBtn.classList.toggle("gt-btn-warn", pending);
  }

  function syncNewGameBtnHighlight() {
    if (!newGameBtn) return;
    const noGames = !games.length;
    const namePending = newGameNameInput.value.length > 0;
    const highlight = noGames || namePending;
    newGameBtn.classList.toggle("gt-btn-highlight", highlight);
    newGameBtn.classList.toggle("gt-btn-warn", highlight);
    newGameBtn.classList.toggle("gt-btn-secondary", !highlight);
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
    refreshCompetitorLabeler();
    const rosterIds = rosterIdsFromTournament(tournament);
    const scoringMode = getScoringMode(tournament);
    const nounCap = competitorNounCap(true);

    tournamentName.innerHTML = `${escapeHtml(tournament.name || "Tournament")} <span class="gt-badge-active">Active</span>`;
    tournamentDate.textContent = formatDate(tournament.date);
    tournamentScoring.textContent =
      scoringMode === "points"
        ? "Scoring: Points (5-3-1)"
        : "Scoring: Game wins";
    tournamentPlayers.textContent = rosterIds.length
      ? `${nounCap}: ${GameTracker.sortByName(rosterIds, (id) => competitorLabel(id))
          .map((id) => competitorLabel(id))
          .join(", ")}`
      : `No ${nounCap.toLowerCase()}`;

    if (currentStandingsLink && tournament.id) {
      currentStandingsLink.href = `current-standings.html?id=${encodeURIComponent(tournament.id)}&returnTo=${encodeURIComponent(window.location.href)}`;
    }

    if (rosterPanelTitle) {
      rosterPanelTitle.textContent = `Add ${nounCap} to Tournament`;
    }
    if (savePlayersBtn) {
      savePlayersBtn.textContent = `Update ${nounCap.toLowerCase()}`;
    }
    if (goToCompetitorsLink) {
      const target = isTeamTournament() ? "teams.html" : "players.html";
      goToCompetitorsLink.href = `${target}?returnTo=${encodeURIComponent(window.location.href)}`;
      goToCompetitorsLink.textContent = `Click Here if ${competitorNounCap()} Does Not Appear`;
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
      const [tournamentData, playerData, teamData, gameData] = await Promise.all([
        api(`${API_URL}?id=${encodeURIComponent(id)}`, "GET"),
        api(PLAYERS_API_URL, "GET"),
        api(TEAMS_API_URL, "GET"),
        api(GAMES_API_URL, "GET"),
      ]);

      tournament = tournamentData;
      players = Array.isArray(playerData) ? playerData : [];
      teams = Array.isArray(teamData) ? teamData : [];
      games = Array.isArray(gameData) ? gameData : [];
      refreshCompetitorLabeler();

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
    syncSavePlayBtnHighlight();
  });

  playForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!tournament) return;

    const gameId = playGame.value;
    const scoringMode = getScoringMode(tournament);
    if (!gameId) {
      setFormStatus("Select a game.", true);
      return;
    }

    savePlayBtn.disabled = true;
    setFormStatus("");
    try {
      if (editingPlayId) {
        const payload = {
          tournamentId: tournament.id,
          playId: editingPlayId,
          gameId,
        };
        if (scoringMode === "points") {
          payload.placementIds = getPlayPlacementIds(
            (tournament.plays || []).find((p) => p.id === editingPlayId) || {}
          );
        } else {
          payload.winnerIds =
            playWinner && playWinner.value ? [playWinner.value] : getPlayWinnerIds(
              (tournament.plays || []).find((p) => p.id === editingPlayId) || {}
            );
        }
        await api(API_URL, "PUT", payload);
        setFormStatus("Game updated.");
      } else {
        const payload = {
          tournamentId: tournament.id,
          gameId,
        };
        if (scoringMode === "points") {
          payload.placementIds = [];
        } else {
          payload.winnerIds = [];
        }
        await api(API_URL, "POST", payload);
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
      "select[data-assign-winner], select[data-add-winner], select[data-update-winner], select[data-placement]"
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
    } else if (select.matches("select[data-placement]")) {
      pendingKey = placementKey(playId, select.getAttribute("data-place-index"));
    }

    if (select.value) {
      pendingWinnerValues[pendingKey] = select.value;
      dirtyWinnerSelects.add(pendingKey);
    } else {
      delete pendingWinnerValues[pendingKey];
      dirtyWinnerSelects.delete(pendingKey);
    }

    if (select.matches("select[data-add-winner]") || select.matches("select[data-placement]")) {
      renderPlays();
      return;
    }

    select.classList.toggle("gt-pending", dirtyWinnerSelects.has(pendingKey) && !!select.value);
    syncWinnerButtonHighlight(select);
  });

  playsList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !tournament) return;

    const playId = button.getAttribute("data-play-id");
    const action = button.getAttribute("data-action");
    const play = (tournament.plays || []).find((p) => p.id === playId);
    if (!play) return;

    if (action === "save-placements") {
      const saved = getPlayPlacementIds(play);
      const placementPlayerIds = collectPlacementIdsFromUi(playId, saved);
      const unique = new Set(placementPlayerIds);
      if (unique.size !== placementPlayerIds.length) {
        setFormStatus(`Each ${competitorNoun()} can only have one place in a game.`, true);
        return;
      }
      await savePlayPlacements(playId, play, placementPlayerIds, button, "Placements updated.");
      return;
    }

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
        setFormStatus(`That ${competitorNoun()} is already a winner for this game.`, true);
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
        setFormStatus(`That ${competitorNoun()} is already a winner for this game.`, true);
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
        setFormStatus(`That ${competitorNoun()} is already a winner for this game.`, true);
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

  function syncNewGameNamePendingStyle() {
    newGameNameInput.classList.toggle("gt-pending", newGameNameInput.value.length > 0);
    syncNewGameBtnHighlight();
  }

  newGameNameInput.addEventListener("input", () => {
    syncNewGameNamePendingStyle();
  });

  if (showNewGameBtn) {
    showNewGameBtn.addEventListener("click", () => {
      showNewGameForm = true;
      fillSelects();
      setNewGameStatus("");
      newGameNameInput.focus();
      if (newGamePanel) {
        newGamePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
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
      syncNewGameNamePendingStyle();
      setNewGameStatus(`Game "${name}" added.`);
      games = await api(GAMES_API_URL, "GET");
      if (!Array.isArray(games)) games = [];
      showNewGameForm = false;
      fillSelects();
      const addedGame = games.find(
        (game) => String(game.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (addedGame && !editingPlayId) {
        playGame.value = String(addedGame.id);
        playGame.classList.add("gt-pending");
        syncSavePlayBtnHighlight();
        setFormStatus(
          `Game "${name}" added to the list. Click "Add game to tournament" to add it to this tournament.`
        );
      }
    } catch (err) {
      setNewGameStatus(err.message || "Failed to add game.", true);
    }
  });

  addPlayersList.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[name="player"]');
    if (!checkbox || !tournament) return;
    syncPlayerCheckboxStyles();
  });

  savePlayersBtn.addEventListener("click", async () => {
    if (!tournament) return;
    const checked = Array.from(addPlayersList.querySelectorAll('input[name="player"]:checked'))
      .map((cb) => cb.value);
    if (!checked.length) {
      setPlayersStatus(`Select at least one ${competitorNoun()}.`, true);
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
        scoringMode: getScoringMode(tournament),
        competitorType: getCompetitorType(tournament),
        competitorIds: checked,
      });
      tournament = await api(`${API_URL}?id=${encodeURIComponent(tournament.id)}`, "GET");
      renderActive();
      setPlayersStatus(`${competitorNounCap(true)} updated.`);
    } catch (err) {
      setPlayersStatus(err.message || `Failed to update ${competitorNoun(true)}.`, true);
    } finally {
      savePlayersBtn.disabled = false;
    }
  });

  endTournamentBtn.addEventListener("click", async () => {
    if (!tournament) return;
    if (!window.confirm("Are you sure you want to End the Tournament?")) {
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
        scoringMode: getScoringMode(tournament),
        competitorType: getCompetitorType(tournament),
        competitorIds: rosterIdsFromTournament(tournament),
      });
      window.location.href = `tournament-summary.html?id=${encodeURIComponent(tournament.id)}`;
    } catch (err) {
      endTournamentBtn.disabled = false;
      setFormStatus(err.message || "End failed.", true);
    }
  });

  loadPage();
})();
