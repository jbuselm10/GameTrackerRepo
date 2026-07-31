(() => {
  const API_URL = "api/players.php";

  const form = document.getElementById("player-form");
  const formTitle = document.getElementById("form-title");
  const playerIdInput = document.getElementById("player-id");
  const nameInput = document.getElementById("player-name");
  const nicknameInput = document.getElementById("player-nickname");
  const nameError = document.getElementById("name-error");
  const submitBtn = document.getElementById("submit-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const formStatus = document.getElementById("form-status");
  const listStatus = document.getElementById("list-status");
  const playerList = document.getElementById("player-list");
  const emptyState = document.getElementById("empty-state");

  let players = [];
  let editingId = null;
  let savedName = "";
  let savedNickname = "";
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = (method, body) => GameTracker.api(API_URL, method, body);

  function syncPendingFieldStyles() {
    nameInput.classList.toggle(
      "gt-pending",
      nameInput.value.length > 0 && nameInput.value !== savedName
    );
    nicknameInput.classList.toggle(
      "gt-pending",
      nicknameInput.value.length > 0 && nicknameInput.value !== savedNickname
    );
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

  function resetForm() {
    editingId = null;
    savedName = "";
    savedNickname = "";
    playerIdInput.value = "";
    nameInput.value = "";
    nicknameInput.value = "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Add player";
    submitBtn.textContent = "Add player";
    cancelEditBtn.classList.add("hidden");
    syncPendingFieldStyles();
  }

  function startEdit(player) {
    editingId = player.id;
    savedName = player.name || "";
    savedNickname = player.nickname || "";
    playerIdInput.value = player.id;
    nameInput.value = player.name || "";
    nicknameInput.value = player.nickname || "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Edit player";
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    syncPendingFieldStyles();
    nameInput.focus();
    setFormStatus("");
  }

  function renderPlayers() {
    playerList.innerHTML = "";
    listStatus.classList.add("hidden");

    if (!players.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    for (const player of players) {
      const li = document.createElement("li");
      li.className = "flex flex-wrap items-center justify-between gap-3 py-3";

      const nickname = player.nickname
        ? `<span class="gt-muted"> (${escapeHtml(player.nickname)})</span>`
        : "";

      li.innerHTML = `
        <div>
          <p class="font-medium text-ink">${escapeHtml(player.name)}${nickname}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="edit" data-id="${escapeHtml(player.id)}"
            class="gt-btn-secondary text-sm">
            Edit
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(player.id)}"
            class="gt-btn-danger text-sm">
            Delete
          </button>
        </div>
      `;
      playerList.appendChild(li);
    }
  }

  async function loadPlayers() {
    listStatus.textContent = "Loading players…";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    try {
      players = await api("GET");
      if (!Array.isArray(players)) {
        players = [];
      }
      renderPlayers();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load players.";
      listStatus.classList.remove("hidden");
      playerList.innerHTML = "";
    }
  }

  function playerNameExists(name, excludeId = null) {
    const needle = String(name || "").trim().toLowerCase();
    return players.some((player) => {
      if (excludeId && player.id === excludeId) return false;
      return String(player.name || "").trim().toLowerCase() === needle;
    });
  }

  nameInput.addEventListener("input", () => {
    nameError.classList.add("hidden");
    syncPendingFieldStyles();
  });

  nicknameInput.addEventListener("input", () => {
    syncPendingFieldStyles();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const nickname = nicknameInput.value.trim();

    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      nameInput.focus();
      return;
    }
    if (playerNameExists(name, editingId)) {
      nameError.textContent = "Player already exists.";
      nameError.classList.remove("hidden");
      nameInput.focus();
      return;
    }
    nameError.classList.add("hidden");
    submitBtn.disabled = true;
    setFormStatus("");

    try {
      if (editingId) {
        await api("PUT", { id: editingId, name, nickname });
        setFormStatus("Player updated.");
      } else {
        await api("POST", { name, nickname });
        setFormStatus("Player added.");
      }
      resetForm();
      await loadPlayers();
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

  playerList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.getAttribute("data-id");
    const action = button.getAttribute("data-action");
    const player = players.find((p) => p.id === id);
    if (!player) return;

    if (action === "edit") {
      startEdit(player);
      return;
    }

    if (action === "delete") {
      const label = player.nickname
        ? `${player.name} (${player.nickname})`
        : player.name;
      if (!window.confirm(`Delete ${label}?`)) {
        return;
      }
      try {
        await api("DELETE", { id });
        if (editingId === id) {
          resetForm();
        }
        setFormStatus("Player deleted.");
        await loadPlayers();
      } catch (err) {
        setFormStatus(err.message || "Delete failed.", true);
      }
    }
  });

  const returnBtn = document.getElementById("return-btn");
  const params = new URLSearchParams(window.location.search);
  const returnTo = params.get("returnTo");
  if (returnTo && returnBtn) {
    returnBtn.classList.remove("hidden");
    returnBtn.addEventListener("click", () => {
      window.location.href = returnTo;
    });
  }

  loadPlayers();
})();
