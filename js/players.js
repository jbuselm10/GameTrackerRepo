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

  function resetForm() {
    editingId = null;
    playerIdInput.value = "";
    nameInput.value = "";
    nicknameInput.value = "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Add player";
    submitBtn.textContent = "Add player";
    cancelEditBtn.classList.add("hidden");
  }

  function startEdit(player) {
    editingId = player.id;
    playerIdInput.value = player.id;
    nameInput.value = player.name || "";
    nicknameInput.value = player.nickname || "";
    nameError.classList.add("hidden");
    formTitle.textContent = "Edit player";
    submitBtn.textContent = "Save changes";
    cancelEditBtn.classList.remove("hidden");
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
        ? `<span class="text-slate-500"> (${escapeHtml(player.nickname)})</span>`
        : "";

      li.innerHTML = `
        <div>
          <p class="font-medium text-slate-900">${escapeHtml(player.name)}${nickname}</p>
        </div>
        <div class="flex gap-2">
          <button type="button" data-action="edit" data-id="${escapeHtml(player.id)}"
            class="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Edit
          </button>
          <button type="button" data-action="delete" data-id="${escapeHtml(player.id)}"
            class="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
            Delete
          </button>
        </div>
      `;
      playerList.appendChild(li);
    }
  }

  async function api(method, body) {
    const options = {
      method,
      headers: { Accept: "application/json" },
    };
    if (body !== undefined) {
      options.headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }
    const response = await fetch(API_URL, options);
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const nickname = nicknameInput.value.trim();

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
