(() => {
  const API_URL = "api/tournaments.php";
  const PLAYERS_API_URL = "api/players.php";

  const form = document.getElementById("tournament-form");
  const formTitle = document.getElementById("form-title");
  const tournamentIdInput = document.getElementById("tournament-id");
  const nameInput = document.getElementById("tournament-name");
  const dateInput = document.getElementById("tournament-date");
  const statusInput = document.getElementById("tournament-status");
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

  let tournaments = [];
  let players = [];
  let editingId = null;

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
    formStatus.classList.remove("hidden", "text-red-600", "text-emerald-700");
    formStatus.classList.add(isError ? "text-red-600" : "text-emerald-700");
  }

  function playersEditable() {
    return statusInput.value !== "ended";
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

  function renderPlayerOptions() {
    playersContainer.innerHTML = "";

    if (!players.length) {
      playersEmpty.classList.remove("hidden");
      return;
    }

    playersEmpty.classList.add("hidden");

    for (const player of players) {
      const label = document.createElement("label");
      label.className = "flex items-center gap-2 text-sm text-slate-700";
      const nickname = player.nickname
        ? ` (${escapeHtml(player.nickname)})`
        : "";
      label.innerHTML = `
        <input
          type="checkbox"
          data-player-id="${escapeHtml(player.id)}"
          class="rounded border-slate-300 text-slate-900 focus:ring-slate-200"
        />
        <span>${escapeHtml(player.name)}${nickname}</span>
      `;
      playersContainer.appendChild(label);
    }

    updatePlayersLockState();
  }

  function resetForm() {
    editingId = null;
    tournamentIdInput.value = "";
    nameInput.value = "";
    dateInput.value = todayIsoDate();
    statusInput.value = "active";
    setSelectedPlayerIds([]);
    nameError.classList.add("hidden");
    dateError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.textContent = "Add tournament";
    submitBtn.textContent = "Add tournament";
    cancelEditBtn.classList.add("hidden");
    newTournamentBtn.classList.remove("hidden");
    formSection.classList.remove("border-blue-500", "ring-2", "ring-blue-200");
    formSection.classList.add("border-slate-200");
    updatePlayersLockState();
  }

  function startEdit(tournament) {
    editingId = tournament.id;
    tournamentIdInput.value = tournament.id;
    nameInput.value = tournament.name || "";
    dateInput.value = tournament.date || "";
    statusInput.value = tournament.status === "ended" ? "ended" : "active";
    setSelectedPlayerIds(tournament.playerIds || []);
    nameError.classList.add("hidden");
    dateError.classList.add("hidden");
    playersError.classList.add("hidden");
    formTitle.innerHTML = `Edit tournament — <strong>${escapeHtml(tournament.name)}</strong>`;
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    newTournamentBtn.classList.add("hidden");
    formSection.classList.remove("border-slate-200");
    formSection.classList.add("border-blue-500", "ring-2", "ring-blue-200");
    updatePlayersLockState();
    formSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    nameInput.focus();
    setFormStatus("");
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

  function statusBadge(status) {
    if (status === "ended") {
      return '<span class="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-slate-700">Ended</span>';
    }
    return '<span class="rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-800">Active</span>';
  }

  function playerLabel(playerId) {
    const player = players.find((p) => p.id === playerId);
    if (!player) return playerId;
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function formatPlayers(playerIds) {
    const ids = Array.isArray(playerIds) ? playerIds : [];
    if (!ids.length) {
      return '<p class="mt-1 text-sm text-slate-500">No players</p>';
    }
    const names = ids.map((id) => escapeHtml(playerLabel(id))).join(", ");
    return `<p class="mt-1 text-sm font-bold text-slate-700">Players: ${names}</p>`;
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
      li.className = "flex flex-wrap items-start justify-between gap-3 py-3";

      li.innerHTML = `
        <div>
          <p class="font-medium text-slate-900">${escapeHtml(tournament.name)} ${statusBadge(tournament.status)}</p>
          <p class="mt-1 text-sm text-slate-500">${formatDate(tournament.date)}</p>
          ${formatPlayers(tournament.playerIds)}
        </div>
        <div class="flex shrink-0 gap-2">
          <a
            href="active-tournament.html?id=${encodeURIComponent(tournament.id)}"
            class="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Update Tournament Details
          </a>
          <button type="button" data-action="edit" data-id="${escapeHtml(tournament.id)}"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Edit Name and Players
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(tournament.id)}"
            class="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Delete
          </button>
        </div>
      `;
      tournamentList.appendChild(li);
    }
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const date = dateInput.value.trim();
    const status = statusInput.value === "ended" ? "ended" : "active";
    const playerIds = getSelectedPlayerIds();

    let valid = true;
    if (!name) {
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
        await api(API_URL, "PUT", { id: editingId, name, date, status, playerIds });
        setFormStatus("Tournament updated.");
      } else {
        await api(API_URL, "POST", { name, date, status, playerIds });
        setFormStatus("Tournament added.");
      }
      resetForm();
      await loadTournaments();
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
    try {
      await loadPlayers();
    } catch (err) {
      players = [];
      renderPlayerOptions();
      setFormStatus(err.message || "Failed to load players.", true);
    }
    resetForm();
    await loadTournaments();
  }

  init();
})();
