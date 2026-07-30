(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";

  const form = document.getElementById("tournament-form");
  const formTitle = document.getElementById("form-title");
  const tournamentIdInput = document.getElementById("tournament-id");
  const nameInput = document.getElementById("tournament-name");
  const dateInput = document.getElementById("tournament-date");
  const statusInput = document.getElementById("tournament-status");
  const scoringInput = document.getElementById("tournament-scoring");
  const scoringLocked = document.getElementById("scoring-locked");
  const playersContainer = document.getElementById("tournament-players");
  const playersEmpty = document.getElementById("players-empty");
  const playersError = document.getElementById("players-error");
  const playersLocked = document.getElementById("players-locked");
  const nameError = document.getElementById("name-error");
  const dateError = document.getElementById("date-error");
  const submitBtn = document.getElementById("submit-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const formStatus = document.getElementById("form-status");
  const listStatus = document.getElementById("list-status");
  const tournamentList = document.getElementById("tournament-list");
  const emptyState = document.getElementById("empty-state");
  const formSection = document.getElementById("form-section");
  const newTournamentBtn = document.getElementById("new-tournament-btn");
  const addPlayerLink = document.getElementById("add-player-link");

  const FORM_DRAFT_KEY = "gametracker.tournamentFormDraft";

  let tournaments = [];
  let players = [];
  let editingId = null;
  let savedName = "";
  let savedPlayerIds = new Set();
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = GameTracker.api.bind(GameTracker);

  function syncNamePendingStyle() {
    const isPending = nameInput.value.length > 0 && nameInput.value !== savedName;
    nameInput.classList.toggle("gt-pending", isPending);
  }

  function saveFormDraft() {
    const draft = {
      editingId,
      name: nameInput.value,
      date: dateInput.value,
      status: statusInput.value,
      scoringMode: scoringInput.value,
      playerIds: getSelectedPlayerIds(),
    };
    try {
      sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures; navigation still works.
    }
  }

  function restoreFormDraft() {
    let raw;
    try {
      raw = sessionStorage.getItem(FORM_DRAFT_KEY);
    } catch {
      return false;
    }
    if (!raw) return false;

    try {
      sessionStorage.removeItem(FORM_DRAFT_KEY);
    } catch {
      // Continue with restore even if remove fails.
    }

    let draft;
    try {
      draft = JSON.parse(raw);
    } catch {
      return false;
    }
    if (!draft || typeof draft !== "object") return false;

    const name = typeof draft.name === "string" ? draft.name : "";
    const date = typeof draft.date === "string" ? draft.date : todayIsoDate();
    const status = draft.status === "ended" ? "ended" : "active";
    const scoringMode = draft.scoringMode === "points" ? "points" : "gameWins";
    const playerIds = Array.isArray(draft.playerIds) ? draft.playerIds : [];

    if (draft.editingId) {
      const tournament = tournaments.find((t) => t.id === draft.editingId);
      if (tournament) {
        startEdit(tournament);
        nameInput.value = name;
        dateInput.value = date;
        statusInput.value = status;
        if (!scoringInput.disabled) {
          scoringInput.value = scoringMode;
        }
        setSelectedPlayerIds(playerIds);
        updatePlayersLockState();
        syncPlayerCheckboxStyles();
        syncNamePendingStyle();
        return true;
      }
    }

    editingId = null;
    savedName = "";
    savedPlayerIds = new Set();
    tournamentIdInput.value = "";
    nameInput.value = name;
    dateInput.value = date || todayIsoDate();
    statusInput.value = status;
    scoringInput.value = scoringMode;
    scoringInput.disabled = false;
    scoringLocked.classList.add("hidden");
    setSelectedPlayerIds(playerIds);
    nameError.classList.add("hidden");
    dateError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add tournament";
    submitBtn.textContent = "Add tournament";
    cancelEditBtn.classList.add("hidden");
    newTournamentBtn.classList.remove("hidden");
    formSection.classList.remove("gt-edit-highlight");
    updatePlayersLockState();
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
    formSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return true;
  }

  function todayIsoDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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

  function playersEditable() {
    return statusInput.value !== "ended";
  }

  function scoringModeOf(tournament) {
    return tournament?.scoringMode === "points" ? "points" : "gameWins";
  }

  function scoringLabel(tournament) {
    if (scoringModeOf(tournament) === "points") {
      return "Top 3";
    }
    return "Game wins";
  }

  function updateScoringLockState(tournament) {
    const hasPlays = Array.isArray(tournament?.plays) && tournament.plays.length > 0;
    scoringInput.disabled = hasPlays;
    scoringLocked.classList.toggle("hidden", !hasPlays);
  }

  function getSelectedPlayerIds() {
    return Array.from(
      playersContainer.querySelectorAll('input[type="checkbox"][data-player-id]:checked')
    ).map((input) => input.getAttribute("data-player-id"));
  }

  function setSelectedPlayerIds(playerIds) {
    const selected = new Set(Array.isArray(playerIds) ? playerIds.map(String) : []);
    playersContainer.querySelectorAll('input[type="checkbox"][data-player-id]').forEach((input) => {
      input.checked = selected.has(input.getAttribute("data-player-id"));
    });
  }

  function updatePlayersLockState() {
    const editable = playersEditable();
    playersContainer.querySelectorAll('input[type="checkbox"][data-player-id]').forEach((input) => {
      input.disabled = !editable;
    });
    playersLocked.classList.toggle("hidden", editable);
  }

  function syncPlayerCheckboxStyles() {
    GameTracker.syncPlayerCheckboxStyles(playersContainer, savedPlayerIds, {
      active: true,
      inputSelector: 'input[type="checkbox"][data-player-id]',
      getPlayerId: (input) => input.getAttribute("data-player-id"),
    });
  }

  function renderPlayerOptions() {
    playersContainer.innerHTML = "";

    const hasPlayers = players.length > 0;
    if (addPlayerLink) {
      addPlayerLink.classList.toggle("gt-btn-highlight", !hasPlayers);
      addPlayerLink.classList.toggle("gt-btn-warn", !hasPlayers);
    }

    if (!hasPlayers) {
      playersEmpty.classList.remove("hidden");
      return;
    }

    playersEmpty.classList.add("hidden");

    for (const player of players) {
      const label = document.createElement("label");
      label.className = "flex items-center gap-2 text-sm text-ink";
      const nickname = player.nickname
        ? ` (${escapeHtml(player.nickname)})`
        : "";
      label.innerHTML = `
        <input
          type="checkbox"
          data-player-id="${escapeHtml(player.id)}"
          class="rounded border-wood/40 text-felt focus:ring-felt/30"
        />
        <span>${escapeHtml(player.name)}${nickname}</span>
      `;
      playersContainer.appendChild(label);
    }

    updatePlayersLockState();
    syncPlayerCheckboxStyles();
  }

  function resetForm() {
    editingId = null;
    savedName = "";
    savedPlayerIds = new Set();
    tournamentIdInput.value = "";
    nameInput.value = "";
    dateInput.value = todayIsoDate();
    statusInput.value = "active";
    scoringInput.value = "gameWins";
    scoringInput.disabled = false;
    scoringLocked.classList.add("hidden");
    setSelectedPlayerIds([]);
    nameError.classList.add("hidden");
    dateError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add tournament";
    submitBtn.textContent = "Add tournament";
    cancelEditBtn.classList.add("hidden");
    newTournamentBtn.classList.remove("hidden");
    formSection.classList.remove("gt-edit-highlight");
    updatePlayersLockState();
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
  }

  function startEdit(tournament) {
    editingId = tournament.id;
    savedName = tournament.name || "";
    savedPlayerIds = new Set((tournament.playerIds || []).map(String));
    tournamentIdInput.value = tournament.id;
    nameInput.value = tournament.name || "";
    dateInput.value = tournament.date || "";
    statusInput.value = tournament.status === "ended" ? "ended" : "active";
    scoringInput.value = scoringModeOf(tournament);
    updateScoringLockState(tournament);
    setSelectedPlayerIds(tournament.playerIds || []);
    nameError.classList.add("hidden");
    dateError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.innerHTML = `Edit tournament — <strong>${escapeHtml(tournament.name)}</strong>`;
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    newTournamentBtn.classList.add("hidden");
    formSection.classList.add("gt-edit-highlight");
    updatePlayersLockState();
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
    formSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    nameInput.focus();
    setFormStatus("");
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

  function playerLabel(playerId) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return playerId;
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function formatPlayers(playerIds) {
    const ids = Array.isArray(playerIds) ? playerIds : [];
    if (!ids.length) {
      return '<p class="mt-1 text-sm gt-muted">No players</p>';
    }
    const names = ids.map((id) => escapeHtml(playerLabel(id))).join(", ");
    return `<p class="mt-1 text-sm font-bold text-ink">Players: ${names}</p>`;
  }

  function renderTournaments() {
    tournamentList.innerHTML = "";
    listStatus.classList.add("hidden");

    const activeTournaments = tournaments.filter((t) => t.status === "active");

    if (!activeTournaments.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    for (const tournament of activeTournaments) {
      const li = document.createElement("li");
      li.className = "space-y-3 py-3";

      li.innerHTML = `
        <div>
          <p class="text-lg font-bold text-ink">${escapeHtml(tournament.name)}</p>
          <p class="mt-1 text-sm gt-muted">Type of scoring: ${escapeHtml(scoringLabel(tournament))}</p>
          <p class="mt-1 text-sm gt-muted">Date of Tournament - ${formatDate(tournament.date)}</p>
          ${formatPlayers(tournament.playerIds)}
        </div>
        <div class="flex w-full flex-wrap gap-2">
          <a
            href="active-tournament.html?id=${encodeURIComponent(tournament.id)}"
            class="gt-btn text-xs"
          >
            Update Tournament Details
          </a>
          <button type="button" data-action="edit" data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-secondary text-xs">
            Edit Name and Players
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-danger text-xs">
            Delete
          </button>
        </div>
      `;
      tournamentList.appendChild(li);
    }
  }

  async function loadPlayers() {
    const data = await api(PLAYERS_API_URL, "GET");
    players = Array.isArray(data) ? data : [];
    renderPlayerOptions();
  }

  async function loadTournaments() {
    listStatus.textContent = "Loading tournaments…";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    try {
      tournaments = await api(API_URL, "GET");
      if (!Array.isArray(tournaments)) {
        tournaments = [];
      }
      renderTournaments();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load tournaments.";
      listStatus.classList.remove("hidden");
      tournamentList.innerHTML = "";
    }
  }

  statusInput.addEventListener("change", () => {
    updatePlayersLockState();
  });

  nameInput.addEventListener("input", () => {
    nameError.classList.add("hidden");
    syncNamePendingStyle();
  });

  playersContainer.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][data-player-id]');
    if (!checkbox) return;
    syncPlayerCheckboxStyles();
  });

  function isTournamentNameTaken(name, excludeId = null) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return false;
    return tournaments.some((tournament) => {
      if (excludeId && tournament.id === excludeId) return false;
      return String(tournament.name || "").trim().toLowerCase() === needle;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const date = dateInput.value.trim();
    const status = statusInput.value === "ended" ? "ended" : "active";
    const scoringMode = scoringInput.value === "points" ? "points" : "gameWins";
    const playerIds = getSelectedPlayerIds();

    let valid = true;
    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else if (isTournamentNameTaken(name, editingId)) {
      nameError.textContent = "This Name has been taken";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else {
      nameError.classList.add("hidden");
    }
    if (!date) {
      dateError.classList.remove("hidden");
      if (valid) dateInput.focus();
      valid = false;
    } else {
      dateError.classList.add("hidden");
    }
    if (!playerIds.length) {
      playersError.classList.remove("hidden");
      valid = false;
    } else {
      playersError.classList.add("hidden");
    }
    if (!valid) return;

    submitBtn.disabled = true;
    setFormStatus("");

    try {
      if (editingId) {
        await api(API_URL, "PUT", { id: editingId, name, date, status, scoringMode, playerIds });
        savedName = name;
        nameInput.value = name;
        savedPlayerIds = new Set(playerIds.map(String));
        syncPlayerCheckboxStyles();
        syncNamePendingStyle();
        setFormStatus("Tournament updated.");
        await loadTournaments();
        const updated = tournaments.find((t) => t.id === editingId);
        if (updated) {
          updateScoringLockState(updated);
        }
      } else {
        await api(API_URL, "POST", { name, date, status, scoringMode, playerIds });
        setFormStatus("Tournament added.");
        resetForm();
        await loadTournaments();
      }
    } catch (err) {
      setFormStatus(err.message || "Save failed.", true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelEditBtn.addEventListener("click", () => {
    resetForm();
    setFormStatus("");
  });

  newTournamentBtn.addEventListener("click", () => {
    resetForm();
    setFormStatus("");
    nameInput.focus();
  });

  tournamentList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.getAttribute("data-id");
    const action = button.getAttribute("data-action");
    const tournament = tournaments.find((t) => t.id === id);
    if (!tournament) return;

    if (action === "edit") {
      startEdit(tournament);
      return;
    }

    if (action === "delete") {
      if (!window.confirm(`Delete ${tournament.name}?`)) {
        return;
      }
      try {
        await api(API_URL, "DELETE", { id });
        if (editingId === id) {
          resetForm();
        }
        setFormStatus("Tournament deleted.");
        await loadTournaments();
      } catch (err) {
        setFormStatus(err.message || "Delete failed.", true);
      }
    }
  });

  async function init() {
    if (addPlayerLink) {
      addPlayerLink.href = `players.html?returnTo=${encodeURIComponent(window.location.href)}`;
      addPlayerLink.addEventListener("click", () => {
        saveFormDraft();
      });
    }

    try {
      await loadPlayers();
    } catch (err) {
      players = [];
      renderPlayerOptions();
      setFormStatus(err.message || "Failed to load players.", true);
    }
    resetForm();
    await loadTournaments();
    restoreFormDraft();
  }

  init();
})();
