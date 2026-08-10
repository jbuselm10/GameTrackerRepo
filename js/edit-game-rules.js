(() => {
  const API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const pageTitle = document.getElementById("page-title");
  const editPanel = document.getElementById("edit-panel");
  const rulesForm = document.getElementById("rules-form");
  const rulesText = document.getElementById("rules-text");
  const saveBtn = document.getElementById("save-btn");
  const cancelBtn = document.getElementById("cancel-btn");
  const returnBtn = document.getElementById("return-btn");
  const formStatus = document.getElementById("form-status");
  const fetchJson = GameTracker.api.bind(GameTracker);

  let currentGame = null;
  let savedRules = "";

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

  function hasUnsavedChanges() {
    return rulesText.value !== savedRules;
  }

  function goToGames() {
    window.location.href = "games.html";
  }

  function returnWithConfirm() {
    if (!hasUnsavedChanges()) {
      goToGames();
      return;
    }
    GameTracker.confirmUnsavedChanges({
      message: "Rules have not been saved. Do you want to Save or Return without saving?",
      saveLabel: "Save",
      discardLabel: "Return without saving",
      onSave: async () => {
        const saved = await saveRules();
        if (saved) {
          goToGames();
        }
      },
      onDiscard: () => {
        goToGames();
      },
    });
  }

  function syncSaveHighlight() {
    const pending = hasUnsavedChanges();
    saveBtn.classList.toggle("gt-btn-highlight", pending);
    saveBtn.classList.toggle("gt-btn-warn", pending);
  }

  function renderEditor(game) {
    currentGame = game;
    savedRules = String(game.rules || "");
    pageTitle.textContent = `Edit Rules — ${game.name || "Game"}`;
    rulesText.value = savedRules;
    syncSaveHighlight();
    pageStatus.classList.add("hidden");
    editPanel.classList.remove("hidden");
  }

  async function saveRules() {
    if (!currentGame) return false;
    saveBtn.disabled = true;
    setFormStatus("");

    try {
      await fetchJson(API_URL, "PUT", {
        id: currentGame.id,
        name: currentGame.name,
        rules: rulesText.value.trim(),
      });
      savedRules = rulesText.value.trim();
      rulesText.value = savedRules;
      syncSaveHighlight();
      goToGames();
      return true;
    } catch (err) {
      setFormStatus(err.message || "Save failed.", true);
      return false;
    } finally {
      saveBtn.disabled = false;
    }
  }

  async function loadGame() {
    const id = getQueryId();
    if (!id) {
      pageStatus.textContent = "Missing game id.";
      return;
    }

    pageStatus.textContent = "Loading rules…";
    pageStatus.classList.remove("hidden");
    editPanel.classList.add("hidden");

    try {
      const data = await fetchJson(API_URL);
      const games = Array.isArray(data) ? data : [];
      const game = games.find((item) => item.id === id);
      if (!game) {
        pageStatus.textContent = "Game not found.";
        return;
      }
      renderEditor(game);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load game.";
      pageStatus.classList.remove("hidden");
      editPanel.classList.add("hidden");
    }
  }

  rulesText.addEventListener("input", syncSaveHighlight);

  rulesForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveRules();
  });

  if (cancelBtn) {
    cancelBtn.addEventListener("click", returnWithConfirm);
  }
  if (returnBtn) {
    returnBtn.addEventListener("click", returnWithConfirm);
  }

  loadGame();
})();
