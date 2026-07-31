(() => {
  const API_URL = "api/teams.php";
  const PLAYERS_API_URL = "api/players.php";

  const form = document.getElementById("team-form");
  const formTitle = document.getElementById("form-title");
  const teamIdInput = document.getElementById("team-id");
  const nameInput = document.getElementById("team-name");
  const nameError = document.getElementById("name-error");
  const playersContainer = document.getElementById("team-players");
  const playersEmpty = document.getElementById("players-empty");
  const playersError = document.getElementById("players-error");
  const submitBtn = document.getElementById("submit-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const formStatus = document.getElementById("form-status");
  const listStatus = document.getElementById("list-status");
  const teamList = document.getElementById("team-list");
  const emptyState = document.getElementById("empty-state");
  const addPlayerLink = document.getElementById("add-player-link");

  const FORM_DRAFT_KEY = "gametracker.teamFormDraft";

  let teams = [];
  let players = [];
  let editingId = null;
  let savedName = "";
  let savedPlayerIds = new Set();
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = GameTracker.api.bind(GameTracker);

  function syncNamePendingStyle() {
    nameInput.classList.toggle(
      "gt-pending",
      nameInput.value.length > 0 && nameInput.value !== savedName
    );
  }

  function saveFormDraft() {
    const draft = {
      editingId,
      name: nameInput.value,
      playerIds: getSelectedPlayerIds(),
    };
    try {
      sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures.
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
    const playerIds = Array.isArray(draft.playerIds) ? draft.playerIds : [];

    if (draft.editingId) {
      const team = teams.find((t) => t.id === draft.editingId);
      if (team) {
        startEdit(team);
        nameInput.value = name;
        setSelectedPlayerIds(playerIds);
        syncPlayerCheckboxStyles();
        syncNamePendingStyle();
        return true;
      }
    }

    editingId = null;
    savedName = "";
    savedPlayerIds = new Set();
    teamIdInput.value = "";
    nameInput.value = name;
    setSelectedPlayerIds(playerIds);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add team";
    submitBtn.textContent = "Add team";
    cancelEditBtn.classList.add("hidden");
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
    return true;
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

  function syncPlayerCheckboxStyles() {
    GameTracker.syncPlayerCheckboxStyles(playersContainer, savedPlayerIds, {
      active: true,
      inputSelector: 'input[type="checkbox"][data-player-id]',
      getPlayerId: (input) => input.getAttribute("data-player-id"),
    });
  }

  function playerLabel(player) {
    if (!player) return "";
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
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
      label.innerHTML = `
        <input
          type="checkbox"
          data-player-id="${escapeHtml(player.id)}"
          class="rounded border-wood/40 text-felt focus:ring-felt/30"
        />
        <span>${escapeHtml(playerLabel(player))}</span>
      `;
      playersContainer.appendChild(label);
    }

    syncPlayerCheckboxStyles();
  }

  function resetForm() {
    editingId = null;
    savedName = "";
    savedPlayerIds = new Set();
    teamIdInput.value = "";
    nameInput.value = "";
    setSelectedPlayerIds([]);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add team";
    submitBtn.textContent = "Add team";
    cancelEditBtn.classList.add("hidden");
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
  }

  function startEdit(team) {
    editingId = team.id;
    savedName = team.name || "";
    savedPlayerIds = new Set((team.playerIds || []).map(String));
    teamIdInput.value = team.id;
    nameInput.value = team.name || "";
    setSelectedPlayerIds(team.playerIds || []);
    nameError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Edit team";
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    syncPlayerCheckboxStyles();
    syncNamePendingStyle();
    nameInput.focus();
    setFormStatus("");
  }

  function formatMembers(playerIds) {
    const ids = Array.isArray(playerIds) ? playerIds : [];
    if (!ids.length) {
      return '<p class="mt-1 text-sm gt-muted">No players</p>';
    }
    const names = ids
      .map((id) => {
        const player = players.find((p) => p.id === id);
        return escapeHtml(player ? playerLabel(player) : id);
      })
      .join(", ");
    return `<p class="mt-1 text-sm gt-muted">Players: ${names}</p>`;
  }

  function renderTeams() {
    teamList.innerHTML = "";
    listStatus.classList.add("hidden");

    if (!teams.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    for (const team of teams) {
      const li = document.createElement("li");
      li.className = "flex flex-wrap items-center justify-between gap-3 py-3";

      li.innerHTML = `
        <div>
          <p class="font-medium text-ink">${escapeHtml(team.name)}</p>
          ${formatMembers(team.playerIds)}
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="edit" data-id="${escapeHtml(team.id)}"
            class="gt-btn-secondary text-sm">
            Edit
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(team.id)}"
            class="gt-btn-danger text-sm">
            Delete
          </button>
        </div>
      `;
      teamList.appendChild(li);
    }
  }

  async function loadPlayers() {
    const data = await api(PLAYERS_API_URL, "GET");
    players = Array.isArray(data) ? data : [];
    renderPlayerOptions();
  }

  async function loadTeams() {
    listStatus.textContent = "Loading teams…";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    try {
      teams = await api(API_URL, "GET");
      if (!Array.isArray(teams)) {
        teams = [];
      }
      renderTeams();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load teams.";
      listStatus.classList.remove("hidden");
      teamList.innerHTML = "";
    }
  }

  function isTeamNameTaken(name, excludeId = null) {
    const needle = String(name || "").trim().toLowerCase();
    if (!needle) return false;
    return teams.some((team) => {
      if (excludeId && team.id === excludeId) return false;
      return String(team.name || "").trim().toLowerCase() === needle;
    });
  }

  nameInput.addEventListener("input", () => {
    nameError.classList.add("hidden");
    syncNamePendingStyle();
  });

  playersContainer.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"][data-player-id]');
    if (!checkbox) return;
    syncPlayerCheckboxStyles();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const playerIds = getSelectedPlayerIds();

    let valid = true;
    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else if (isTeamNameTaken(name, editingId)) {
      nameError.textContent = "This Name has been taken";
      nameError.classList.remove("hidden");
      if (valid) nameInput.focus();
      valid = false;
    } else {
      nameError.classList.add("hidden");
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
        await api(API_URL, "PUT", { id: editingId, name, playerIds });
        setFormStatus("Team updated.");
      } else {
        await api(API_URL, "POST", { name, playerIds });
        setFormStatus("Team added.");
      }
      resetForm();
      await loadTeams();
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

  teamList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.getAttribute("data-id");
    const action = button.getAttribute("data-action");
    const team = teams.find((t) => t.id === id);
    if (!team) return;

    if (action === "edit") {
      startEdit(team);
      return;
    }

    if (action === "delete") {
      if (!window.confirm(`Delete ${team.name}?`)) {
        return;
      }
      try {
        await api(API_URL, "DELETE", { id });
        if (editingId === id) {
          resetForm();
        }
        setFormStatus("Team deleted.");
        await loadTeams();
      } catch (err) {
        setFormStatus(err.message || "Delete failed.", true);
      }
    }
  });

  async function init() {
    const returnBtn = document.getElementById("return-btn");
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get("returnTo");
    if (returnTo && returnBtn) {
      returnBtn.classList.remove("hidden");
      returnBtn.addEventListener("click", () => {
        window.location.href = returnTo;
      });
    }

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
    await loadTeams();
    restoreFormDraft();
  }

  init();
})();
