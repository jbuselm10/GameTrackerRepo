(() => {
  const API_URL = "api/games.php";

  const pageStatus = document.getElementById("page-status");
  const pageTitle = document.getElementById("page-title");
  const rulesPanel = document.getElementById("rules-panel");
  const rulesContent = document.getElementById("rules-content");
  const rulesEmpty = document.getElementById("rules-empty");
  const returnBtn = document.getElementById("return-btn");
  const fetchJson = GameTracker.api.bind(GameTracker);

  function getQueryId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
  }

  function renderRules(game) {
    pageTitle.textContent = `${game.name || "Game"} - Rules`;
    const rules = String(game.rules || "").trim();

    if (!rules) {
      rulesContent.textContent = "";
      rulesContent.classList.add("hidden");
      rulesEmpty.classList.remove("hidden");
    } else {
      rulesEmpty.classList.add("hidden");
      rulesContent.classList.remove("hidden");
      rulesContent.textContent = rules;
    }

    pageStatus.classList.add("hidden");
    rulesPanel.classList.remove("hidden");
  }

  async function loadRules() {
    const id = getQueryId();
    if (!id) {
      pageStatus.textContent = "Missing game id.";
      return;
    }

    pageStatus.textContent = "Loading rules...";
    pageStatus.classList.remove("hidden");
    rulesPanel.classList.add("hidden");

    try {
      const data = await fetchJson(API_URL);
      const games = Array.isArray(data) ? data : [];
      const game = games.find((item) => item.id === id);
      if (!game) {
        pageStatus.textContent = "Game not found.";
        return;
      }
      renderRules(game);
    } catch (err) {
      pageStatus.textContent = err.message || "Failed to load rules.";
      pageStatus.classList.remove("hidden");
      rulesPanel.classList.add("hidden");
    }
  }

  if (returnBtn) {
    returnBtn.addEventListener("click", () => {
      window.location.href = "games.html";
    });
  }

  loadRules();
})();
