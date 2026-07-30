(() => {
  const API_URL = "api/games.php";

  const form = document.getElementById("game-form");
  const formTitle = document.getElementById("form-title");
  const gameIdInput = document.getElementById("game-id");
  const nameInput = document.getElementById("game-name");
  const nameError = document.getElementById("name-error");
  const submitBtn = document.getElementById("submit-btn");
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

  function syncNamePendingStyle() {
    nameInput.classList.toggle(
      "gt-pending",
      nameInput.value.length > 0 && nameInput.value !== savedName
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
    gameIdInput.value = "";
    nameInput.value = "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Add game";
    submitBtn.textContent = "Add game";
    cancelEditBtn.classList.add("hidden");
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
    syncNamePendingStyle();
    nameInput.focus();
    setFormStatus("");
  }

  function renderGames() {
    gameList.innerHTML = "";
    listStatus.classList.add("hidden");

    if (!games.length) {
      emptyState.classList.remove("hidden");
      return;
    }

    emptyState.classList.add("hidden");

    for (const game of games) {
      const li = document.createElement("li");
      li.className = "flex flex-wrap items-center justify-between gap-3 py-3";

      li.innerHTML = `
        <div>
          <p class="font-medium text-ink">${escapeHtml(game.name)}</p>
        </div>
        <div class="flex gap-2">
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
    listStatus.textContent = "Loading games…";
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

  nameInput.addEventListener("input", () => {
    syncNamePendingStyle();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();

    if (!name) {
      nameError.classList.remove("hidden");
      nameInput.focus();
      return;
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

  gameList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const id = button.getAttribute("data-id");
    const action = button.getAttribute("data-action");
    const game = games.find((g) => g.id === id);
    if (!game) return;

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

  loadGames();
})();
