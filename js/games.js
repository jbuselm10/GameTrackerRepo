(() => {
  const API_URL = "api/games.php";

  const form = document.getElementById("game-form");
  const formTitle = document.getElementById("form-title");
  const gameIdInput = document.getElementById("game-id");
  const nameInput = document.getElementById("game-name");
  const nameError = document.getElementById("name-error");
  const submitBtn = document.getElementById("submit-btn");
  const editRulesBtn = document.getElementById("edit-rules-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  const formStatus = document.getElementById("form-status");
  const listStatus = document.getElementById("list-status");
  const gameList = document.getElementById("game-list");
  const emptyState = document.getElementById("empty-state");

  let games = [];
  let editingId = null;
  let savedName = "";
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);
  const api = (method, body) => GameTracker.api(API_URL, method, body);

  function gameHasRules(game) {
    return String(game?.rules || "").trim().length > 0;
  }

  function syncNamePendingStyle() {
    const isPending = nameInput.value.length > 0 && nameInput.value !== savedName;
    nameInput.classList.toggle("gt-pending", isPending);
    submitBtn.classList.toggle("gt-btn-highlight", isPending);
    submitBtn.classList.toggle("gt-btn-warn", isPending);
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
    gameIdInput.value = "";
    nameInput.value = "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Add game";
    submitBtn.textContent = "Add game";
    cancelEditBtn.classList.add("hidden");
    if (editRulesBtn) {
      editRulesBtn.classList.add("hidden");
      editRulesBtn.className = "gt-btn-secondary hidden text-sm";
    }
    syncNamePendingStyle();
  }

  function startEdit(game) {
    editingId = game.id;
    savedName = game.name || "";
    gameIdInput.value = game.id;
    nameInput.value = game.name || "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Edit game";
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
    if (editRulesBtn) {
      editRulesBtn.classList.remove("hidden");
      editRulesBtn.className = gameHasRules(game)
        ? "gt-btn text-sm"
        : "gt-btn-secondary text-sm";
    }
    syncNamePendingStyle();
    nameInput.focus();
    setFormStatus("");
  }

  function goToEditRules(gameId) {
    window.location.href = `edit-game-rules.html?id=${encodeURIComponent(gameId)}`;
  }

  function renderGames() {
    gameList.innerHTML = "";
    listStatus.classList.add("hidden");

    if (!games.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    for (const game of GameTracker.sortByName(games)) {
      const li = document.createElement("li");
      li.className = "flex flex-wrap items-center justify-between gap-3 py-3";
      const hasRules = gameHasRules(game);
      const rulesDisabled = hasRules ? "" : " disabled";
      const rulesClass = hasRules
        ? "gt-btn-secondary text-sm"
        : "gt-btn-secondary text-sm opacity-50 cursor-not-allowed";

      li.innerHTML = `
        <div>
          <p class="font-medium text-ink">${escapeHtml(game.name)}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="rules" data-id="${escapeHtml(game.id)}"
            class="${rulesClass}"${rulesDisabled}>
            Rules
          </button>
          <button type="button" data-action="edit" data-id="${escapeHtml(game.id)}"
            class="gt-btn-secondary text-sm">
            Edit
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(game.id)}"
            class="gt-btn-danger text-sm">
            Delete
          </button>
        </div>
      `;
      gameList.appendChild(li);
    }
  }

  async function loadGames() {
    listStatus.textContent = "Loading games...";
    listStatus.classList.remove("hidden");
    emptyState.classList.add("hidden");
    try {
      games = await api("GET");
      if (!Array.isArray(games)) {
        games = [];
      }
      renderGames();
    } catch (err) {
      listStatus.textContent = err.message || "Failed to load games.";
      listStatus.classList.remove("hidden");
      gameList.innerHTML = "";
    }
  }

  function gameNameExists(name, excludeId = null) {
    const needle = String(name || "").trim().toLowerCase();
    return games.some((game) => {
      if (excludeId && game.id === excludeId) return false;
      return String(game.name || "").trim().toLowerCase() === needle;
    });
  }

  function hasUnsavedChanges() {
    return nameInput.value.trim() !== savedName.trim();
  }

  nameInput.addEventListener("input", () => {
    nameError.classList.add("hidden");
    syncNamePendingStyle();
  });

  async function saveGame() {
    const name = nameInput.value.trim();

    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      nameInput.focus();
      return false;
    }
    if (gameNameExists(name, editingId)) {
      nameError.textContent = "Game already exists.";
      nameError.classList.remove("hidden");
      nameInput.focus();
      return false;
    }
    nameError.classList.add("hidden");
    submitBtn.disabled = true;
    setFormStatus("");

    try {
      if (editingId) {
        await api("PUT", { id: editingId, name });
        setFormStatus("Game updated.");
      } else {
        await api("POST", { name });
        setFormStatus("Game added.");
      }
      resetForm();
      await loadGames();
      return true;
    } catch (err) {
      setFormStatus(err.message || "Save failed.", true);
      return false;
    } finally {
      submitBtn.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveGame();
  });

  cancelEditBtn.addEventListener("click", () => {
    resetForm();
    setFormStatus("");
  });

  if (editRulesBtn) {
    editRulesBtn.addEventListener("click", () => {
      if (!editingId) return;
      const targetId = editingId;
      if (!hasUnsavedChanges()) {
        goToEditRules(targetId);
        return;
      }
      GameTracker.confirmUnsavedChanges({
        message: "Data has not been saved. Do you want to Save Game or continue without saving?",
        saveLabel: "Save Game",
        discardLabel: "Continue without saving",
        onSave: async () => {
          const saved = await saveGame();
          if (saved) {
            goToEditRules(targetId);
          }
        },
        onDiscard: () => {
          goToEditRules(targetId);
        },
      });
    });
  }

  gameList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;

    const id = button.getAttribute("data-id");
    const action = button.getAttribute("data-action");
    const game = games.find((g) => g.id === id);
    if (!game) return;

    if (action === "rules") {
      if (!gameHasRules(game)) return;
      window.location.href = `game-rules.html?id=${encodeURIComponent(game.id)}`;
      return;
    }

    if (action === "edit") {
      startEdit(game);
      return;
    }

    if (action === "delete") {
      if (!window.confirm(`Delete ${game.name}?`)) {
        return;
      }
      try {
        await api("DELETE", { id });
        if (editingId === id) {
          resetForm();
        }
        setFormStatus("Game deleted.");
        await loadGames();
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
      if (!hasUnsavedChanges()) {
        window.location.href = returnTo;
        return;
      }
      GameTracker.confirmUnsavedChanges({
        message: "Data has not been saved. Do you want to Save Game or Return without saving?",
        saveLabel: "Save Game",
        discardLabel: "Return without saving",
        onSave: async () => {
          const saved = await saveGame();
          if (saved) {
            window.location.href = returnTo;
          }
        },
        onDiscard: () => {
          window.location.href = returnTo;
        },
      });
    });
  }

  loadGames();
})();
