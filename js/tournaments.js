(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";
  const TEAMS_API_URL = "api/teams.php";

  const form = document.getElementById("tournament-form");
  const formTitle = document.getElementById("form-title");
  const tournamentIdInput = document.getElementById("tournament-id");
  const nameInput = document.getElementById("tournament-name");
  const scoringInputs = Array.from(form.querySelectorAll('input[name="gtScoringMode"]'));
  const scoringError = document.getElementById("scoring-error");
  const scoringLocked = document.getElementById("scoring-locked");
  const competitorTypeInputs = Array.from(form.querySelectorAll('input[name="gtCompetitorType"]'));
  const competitorTypeError = document.getElementById("competitor-type-error");
  const competitorTypeLocked = document.getElementById("competitor-type-locked");
  const competitorOptionsSection = document.getElementById("competitor-options-section");
  const competitorsLabel = document.getElementById("competitors-label");
  const playersContainer = document.getElementById("tournament-players");
  const playersEmpty = document.getElementById("players-empty");
  const playersError = document.getElementById("players-error");
  const playersLocked = document.getElementById("players-locked");
  const nameError = document.getElementById("name-error");
  const submitBtn = document.getElementById("submit-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const formStatus = document.getElementById("form-status");
  const listStatus = document.getElementById("list-status");
  const tournamentList = document.getElementById("tournament-list");
  const emptyState = document.getElementById("empty-state");
  const formSection = document.getElementById("form-section");
  const addCompetitorLink = document.getElementById("add-player-link");

  const FORM_DRAFT_KEY = "gametracker.tournamentFormDraft";

  let tournaments = [];
  let players = [];
  let teams = [];
  let editingId = null;
  let currentStatus = "active";
  let currentDate = "";
  let savedName = "";
  let savedScoringMode = "";
  let savedCompetitorType = "";
  let savedCompetitorIds = new Set();
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = GameTracker.api.bind(GameTracker);

  function syncNamePendingStyle() {
    const isPending = nameInput.value.length > 0 && nameInput.value !== savedName;
    nameInput.classList.toggle("gt-pending", isPending);
  }

  function selectedRadioValue(inputs, fallback = "") {
    return inputs.find((input) => input.checked)?.value || fallback;
  }

  function setRadioValue(inputs, value) {
    inputs.forEach((input) => {
      input.checked = input.value === value;
    });
  }

  function setRadioDisabled(inputs, disabled) {
    inputs.forEach((input) => {
      input.disabled = disabled;
    });
  }

  function currentScoringMode() {
    const value = selectedRadioValue(scoringInputs);
    if (value === "points") return "points";
    if (value === "gameWins") return "gameWins";
    return "";
  }

  function currentCompetitorType() {
    const value = selectedRadioValue(competitorTypeInputs);
    if (value === "team") return "team";
    if (value === "player") return "player";
    return "";
  }

  function syncRadioPendingStyles() {
    const scoringChanged =
      !!currentScoringMode() && currentScoringMode() !== savedScoringMode;
    scoringInputs.forEach((input) => {
      input.classList.toggle("gt-pending", input.checked && scoringChanged);
    });

    const competitorTypeChanged =
      !!currentCompetitorType() && currentCompetitorType() !== savedCompetitorType;
    competitorTypeInputs.forEach((input) => {
      input.classList.toggle("gt-pending", input.checked && competitorTypeChanged);
    });
  }

  function competitorNoun(type, plural = false) {
    if (type === "team") {
      return plural ? "teams" : "team";
    }
    return plural ? "players" : "player";
  }

  function updateCompetitorUiLabels() {
    const type = currentCompetitorType();
    const hasType = type === "player" || type === "team";
    competitorOptionsSection.classList.toggle("hidden", !hasType);
    addCompetitorLink.classList.toggle("hidden", !hasType);
    if (!hasType) {
      playersEmpty.classList.add("hidden");
      playersError.classList.add("hidden");
      return;
    }

    const plural = competitorNoun(type, true);
    const singularCap = type === "team" ? "Team" : "Player";
    competitorsLabel.innerHTML = `${singularCap}s <span class="text-red-600">*</span>`;
    playersEmpty.textContent = `No ${plural} available. Add ${plural} first.`;
    playersError.textContent = `Select at least one ${competitorNoun(type)}.`;
    playersLocked.textContent = `${singularCap}s cannot be changed after a tournament has ended.`;
    if (addCompetitorLink) {
      addCompetitorLink.textContent = `Add ${singularCap}`;
    }
  }

  function updateAddCompetitorLink() {
    if (!addCompetitorLink) return;
    const type = currentCompetitorType();
    if (!type) {
      addCompetitorLink.classList.add("hidden");
      return;
    }
    addCompetitorLink.classList.remove("hidden");
    const target = type === "team" ? "teams.html" : "players.html";
    addCompetitorLink.href = `${target}?returnTo=${encodeURIComponent(window.location.href)}`;
  }

  function saveFormDraft() {
    const draft = {
      editingId,
      name: nameInput.value,
      date: currentDate,
      status: currentStatus,
      scoringMode: currentScoringMode(),
      competitorType: currentCompetitorType(),
      competitorIds: getSelectedCompetitorIds(),
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
    const status = draft.status === "ended" ? "ended" : "active";
    const scoringMode =
      draft.scoringMode === "points"
        ? "points"
        : draft.scoringMode === "gameWins"
          ? "gameWins"
          : "";
    const competitorType =
      draft.competitorType === "team"
        ? "team"
        : draft.competitorType === "player"
          ? "player"
          : "";
    const competitorIds = Array.isArray(draft.competitorIds)
      ? draft.competitorIds
      : Array.isArray(draft.playerIds)
        ? draft.playerIds
        : [];

    if (draft.editingId) {
      const tournament = tournaments.find((t) => t.id === draft.editingId);
      if (tournament) {
        startEdit(tournament);
        nameInput.value = name;
        currentStatus = status;
        if (!scoringInputs.some((input) => input.disabled)) {
          setRadioValue(scoringInputs, scoringMode);
        }
        if (!competitorTypeInputs.some((input) => input.disabled)) {
          setRadioValue(competitorTypeInputs, competitorType);
        }
        updateCompetitorUiLabels();
        renderCompetitorOptions();
        setSelectedCompetitorIds(competitorIds);
        updatePlayersLockState();
        syncCompetitorCheckboxStyles();
        syncRadioPendingStyles();
        syncNamePendingStyle();
        updateAddCompetitorLink();
        return true;
      }
    }

    editingId = null;
    savedName = "";
    savedScoringMode = "";
    savedCompetitorType = "";
    savedCompetitorIds = new Set();
    tournamentIdInput.value = "";
    nameInput.value = name;
    currentDate = todayIsoDate();
    currentStatus = status;
    setRadioValue(scoringInputs, scoringMode);
    setRadioDisabled(scoringInputs, false);
    scoringError.classList.add("hidden");
    scoringLocked.classList.add("hidden");
    setRadioValue(competitorTypeInputs, competitorType);
    setRadioDisabled(competitorTypeInputs, false);
    competitorTypeError.classList.add("hidden");
    competitorTypeLocked.classList.add("hidden");
    updateCompetitorUiLabels();
    renderCompetitorOptions();
    setSelectedCompetitorIds(competitorIds);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add a new active Tournament";
    submitBtn.textContent = "Add tournament";
    cancelEditBtn.classList.add("hidden");
    formSection.classList.remove("gt-edit-highlight");
    updatePlayersLockState();
    syncCompetitorCheckboxStyles();
    syncRadioPendingStyles();
    syncNamePendingStyle();
    updateAddCompetitorLink();
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
    return currentStatus !== "ended";
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
    setRadioDisabled(scoringInputs, hasPlays);
    scoringLocked.classList.toggle("hidden", !hasPlays);
    setRadioDisabled(competitorTypeInputs, hasPlays);
    competitorTypeLocked.classList.toggle("hidden", !hasPlays);
  }

  function getSelectedCompetitorIds() {
    return Array.from(
      playersContainer.querySelectorAll('input[type="checkbox"][data-competitor-id]:checked')
    ).map((input) => input.getAttribute("data-competitor-id"));
  }

  function setSelectedCompetitorIds(competitorIds) {
    const selected = new Set(Array.isArray(competitorIds) ? competitorIds.map(String) : []);
    playersContainer.querySelectorAll('input[type="checkbox"][data-competitor-id]').forEach((input) => {
      input.checked = selected.has(input.getAttribute("data-competitor-id"));
    });
  }

  function updatePlayersLockState() {
    const editable = playersEditable();
    playersContainer.querySelectorAll('input[type="checkbox"][data-competitor-id]').forEach((input) => {
      input.disabled = !editable;
    });
    playersLocked.classList.toggle("hidden", editable);
  }

  function syncCompetitorCheckboxStyles() {
    GameTracker.syncPlayerCheckboxStyles(playersContainer, savedCompetitorIds, {
      active: true,
      inputSelector: 'input[type="checkbox"][data-competitor-id]',
      getPlayerId: (input) => input.getAttribute("data-competitor-id"),
    });
  }

  function renderCompetitorOptions() {
    playersContainer.innerHTML = "";
    const type = currentCompetitorType();
    if (!type) {
      playersEmpty.classList.add("hidden");
      return;
    }
    const options = type === "team" ? teams : players;
    const hasOptions = options.length > 0;

    if (addCompetitorLink) {
      addCompetitorLink.classList.toggle("gt-btn-highlight", !hasOptions);
      addCompetitorLink.classList.toggle("gt-btn-warn", !hasOptions);
    }

    if (!hasOptions) {
      playersEmpty.classList.remove("hidden");
      return;
    }

    playersEmpty.classList.add("hidden");

    for (const option of options) {
      const label = document.createElement("label");
      label.className = "flex items-center gap-2 text-sm text-ink";
      let display;
      if (type === "team") {
        const memberNames = (Array.isArray(option.playerIds) ? option.playerIds : [])
          .map((playerId) => {
            const player = players.find((item) => item.id === playerId);
            return escapeHtml(playerDisplayLabel(player, playerId));
          });
        const members = memberNames.length
          ? ` <span class="gt-muted">(${memberNames.join(", ")})</span>`
          : "";
        display = `<strong>${escapeHtml(option.name)}</strong>${members}`;
      } else {
        const nickname = option.nickname ? ` (${escapeHtml(option.nickname)})` : "";
        display = `${escapeHtml(option.name)}${nickname}`;
      }
      label.innerHTML = `
        <input
          type="checkbox"
          data-competitor-id="${escapeHtml(option.id)}"
          class="rounded border-wood/40 text-felt focus:ring-felt/30"
        />
        <span>${display}</span>
      `;
      playersContainer.appendChild(label);
    }

    updatePlayersLockState();
    syncCompetitorCheckboxStyles();
  }

  function resetForm() {
    editingId = null;
    savedName = "";
    savedScoringMode = "";
    savedCompetitorType = "";
    savedCompetitorIds = new Set();
    tournamentIdInput.value = "";
    nameInput.value = "";
    currentDate = todayIsoDate();
    currentStatus = "active";
    setRadioValue(scoringInputs, "");
    setRadioDisabled(scoringInputs, false);
    scoringError.classList.add("hidden");
    scoringLocked.classList.add("hidden");
    setRadioValue(competitorTypeInputs, "");
    setRadioDisabled(competitorTypeInputs, false);
    competitorTypeError.classList.add("hidden");
    competitorTypeLocked.classList.add("hidden");
    updateCompetitorUiLabels();
    renderCompetitorOptions();
    setSelectedCompetitorIds([]);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add a new active Tournament";
    submitBtn.textContent = "Add tournament";
    cancelEditBtn.classList.add("hidden");
    formSection.classList.remove("gt-edit-highlight");
    updatePlayersLockState();
    syncCompetitorCheckboxStyles();
    syncRadioPendingStyles();
    syncNamePendingStyle();
    updateAddCompetitorLink();
  }

  function startEdit(tournament) {
    editingId = tournament.id;
    savedName = tournament.name || "";
    savedScoringMode = scoringModeOf(tournament);
    savedCompetitorType = getCompetitorType(tournament);
    const roster = rosterIdsFromTournament(tournament);
    savedCompetitorIds = new Set(roster.map(String));
    tournamentIdInput.value = tournament.id;
    nameInput.value = tournament.name || "";
    currentDate = tournament.date || todayIsoDate();
    currentStatus = tournament.status === "ended" ? "ended" : "active";
    setRadioValue(scoringInputs, scoringModeOf(tournament));
    setRadioValue(competitorTypeInputs, getCompetitorType(tournament));
    scoringError.classList.add("hidden");
    competitorTypeError.classList.add("hidden");
    updateScoringLockState(tournament);
    updateCompetitorUiLabels();
    renderCompetitorOptions();
    setSelectedCompetitorIds(roster);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.innerHTML = `Edit tournament — <strong>${escapeHtml(tournament.name)}</strong>`;
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    formSection.classList.add("gt-edit-highlight");
    updatePlayersLockState();
    syncCompetitorCheckboxStyles();
    syncRadioPendingStyles();
    syncNamePendingStyle();
    updateAddCompetitorLink();
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

  function formatCompetitors(tournament) {
    const type = getCompetitorType(tournament);
    const ids = rosterIdsFromTournament(tournament);
    const heading = type === "team" ? "Teams" : "Players";
    if (!ids.length) {
      return `<p class="mt-1 text-sm gt-muted">No ${heading.toLowerCase()}</p>`;
    }
    const labeler = buildCompetitorLabeler(tournament, players, teams);
    const names = ids
      .map((id) => {
        if (type !== "team") {
          return labeler(id);
        }

        const team = teams.find((item) => item.id === id);
        if (!team) {
          return labeler(id);
        }

        const memberNames = (Array.isArray(team.playerIds) ? team.playerIds : [])
          .map((playerId) => {
            const player = players.find((item) => item.id === playerId);
            return playerDisplayLabel(player, playerId);
          });
        return memberNames.length
          ? `${team.name} (${memberNames.join(", ")})`
          : team.name;
      })
      .map(escapeHtml)
      .join(", ");
    return `<p class="mt-1 text-sm font-bold text-ink">${heading}: ${names}</p>`;
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
      const typeLabel = getCompetitorType(tournament) === "team" ? "Teams" : "Players";

      li.innerHTML = `
        <div>
          <p class="text-lg font-bold text-ink">${escapeHtml(tournament.name)}</p>
          <p class="mt-1 text-sm gt-muted">Type of scoring: ${escapeHtml(scoringLabel(tournament))}</p>
          <p class="mt-1 text-sm gt-muted">Competitors: ${escapeHtml(typeLabel)}</p>
          <p class="mt-1 text-sm gt-muted">Date of Tournament - ${formatDate(tournament.date)}</p>
          ${formatCompetitors(tournament)}
        </div>
        <div class="flex w-full flex-wrap gap-2">
          <a
            href="active-tournament.html?id=${encodeURIComponent(tournament.id)}"
            class="gt-btn text-sm"
          >
            Update Tournament Details
          </a>
          <button type="button" data-action="edit" data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-secondary text-sm">
            Edit Name and ${typeLabel}
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(tournament.id)}"
            class="gt-btn-danger text-sm">
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
  }

  async function loadTeams() {
    const data = await api(TEAMS_API_URL, "GET");
    teams = Array.isArray(data) ? data : [];
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

  scoringInputs.forEach((input) => {
    input.addEventListener("change", () => {
      scoringError.classList.add("hidden");
      syncRadioPendingStyles();
    });
  });

  competitorTypeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      savedCompetitorIds = new Set();
      competitorTypeError.classList.add("hidden");
      updateCompetitorUiLabels();
      renderCompetitorOptions();
      setSelectedCompetitorIds([]);
      updateAddCompetitorLink();
      playersError.classList.add("hidden");
      syncRadioPendingStyles();
    });
  });

  nameInput.addEventListener("input", () => {
    nameError.classList.add("hidden");
    syncNamePendingStyle();
  });

  playersContainer.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][data-competitor-id]');
    if (!checkbox) return;
    syncCompetitorCheckboxStyles();
  });

  function tournamentNameConflict(name, excludeId = null) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return "";
    const matches = tournaments.filter((tournament) => {
      if (excludeId && tournament.id === excludeId) return false;
      return String(tournament.name || "").trim().toLowerCase() === needle;
    });
    if (matches.some((tournament) => tournament.status === "active")) {
      return "active";
    }
    return matches.length ? "previous" : "";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const date = currentDate || todayIsoDate();
    const status = currentStatus === "ended" ? "ended" : "active";
    const scoringMode = currentScoringMode();
    const competitorType = currentCompetitorType();
    const competitorIds = getSelectedCompetitorIds();
    const nameConflict = tournamentNameConflict(name, editingId);

    let valid = true;
    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else if (nameConflict) {
      nameError.textContent =
        nameConflict === "previous"
          ? "Tournament Name used previously."
          : "Tournament already exists.";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else {
      nameError.classList.add("hidden");
    }
    if (!scoringMode) {
      scoringError.classList.remove("hidden");
      if (valid) scoringInputs[0]?.focus();
      valid = false;
    } else {
      scoringError.classList.add("hidden");
    }
    if (!competitorType) {
      competitorTypeError.classList.remove("hidden");
      if (valid) competitorTypeInputs[0]?.focus();
      valid = false;
    } else {
      competitorTypeError.classList.add("hidden");
    }
    if (competitorType && !competitorIds.length) {
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
        await api(API_URL, "PUT", {
          id: editingId,
          name,
          date,
          status,
          scoringMode,
          competitorType,
          competitorIds,
        });
        savedName = name;
        savedScoringMode = scoringMode;
        savedCompetitorType = competitorType;
        nameInput.value = name;
        savedCompetitorIds = new Set(competitorIds.map(String));
        syncCompetitorCheckboxStyles();
        syncRadioPendingStyles();
        syncNamePendingStyle();
        setFormStatus("Tournament updated.");
        await loadTournaments();
        const updated = tournaments.find((t) => t.id === editingId);
        if (updated) {
          updateScoringLockState(updated);
        }
      } else {
        await api(API_URL, "POST", {
          name,
          date,
          status,
          scoringMode,
          competitorType,
          competitorIds,
        });
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
    if (addCompetitorLink) {
      addCompetitorLink.addEventListener("click", () => {
        saveFormDraft();
      });
    }

    try {
      await Promise.all([loadPlayers(), loadTeams()]);
    } catch (err) {
      players = [];
      teams = [];
      setFormStatus(err.message || "Failed to load competitors.", true);
    }
    resetForm();
    await loadTournaments();
    restoreFormDraft();
  }

  init();
})();
