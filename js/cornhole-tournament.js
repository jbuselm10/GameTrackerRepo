(() => {
  const pageStatus = document.getElementById("page-status");
  const teamsList = document.getElementById("teams-list");
  const teamsHint = document.getElementById("teams-hint");
  const playersEmpty = document.getElementById("players-empty");
  const typeInputs = Array.from(document.querySelectorAll('input[name="gtCornholeType"]'));
  const typeError = document.getElementById("type-error");
  const teamCountInput = document.getElementById("team-count");
  const teamCountError = document.getElementById("team-count-error");
  const nameInput = document.getElementById("tournament-name");
  const nameError = document.getElementById("name-error");
  const clearAllBtn = document.getElementById("clear-all-fields-btn");
  const lastResultsBtn = document.getElementById("last-results-btn");
  const setupStatus = document.getElementById("setup-status");
  const saveStatus = document.getElementById("save-status");
  const saveBtn = document.getElementById("save-tournament-btn");
  const startBtn = document.getElementById("start-tournament-btn");
  const startError = document.getElementById("start-error");
  const addPlayerLink = document.getElementById("add-player-link");

  const MIN_TEAMS = GameTracker.Cornhole.MIN_TEAMS;
  const MAX_TEAMS = GameTracker.Cornhole.MAX_TEAMS;
  const UNSAVED_MESSAGE = "Changes have NOT been saved.";
  const FORM_DRAFT_KEY = "gametracker.cornholeFormDraft";
  const LAST_RESULTS_KEY = "gametracker.cornholeLastResults";

  /** @type {CornholePlayer[]} */
  let players = [];
  /** @type {CornholeTournamentType | ""} */
  let selectedType = "";
  /** @type {number | null} */
  let teamCount = null;
  /** @type {{ id?: string, player1Id: string, player2Id: string }[]} */
  let teamAssignments = [];
  /** @type {CornholeTeam[]} */
  let savedTeams = [];
  /** @type {string | null} */
  let editingId = null;
  /** @type {CornholeMatch[]} */
  let savedMatches = [];
  /** @type {CornholeTournamentStatus} */
  let savedStatus = GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
  /** @type {{ name: string, type: string, teamCount: number | null, teams: { player1Id: string, player2Id: string }[] } | null} */
  let baseline = null;
  let suppressDirty = false;
  /** Name copied from a completed tournament; cannot be reused until changed. */
  let reservedName = null;
  /** True when the form was filled from a completed tournament. */
  let fromPrepopulated = false;

  function setStatus(message, isError = false) {
    if (!pageStatus) return;
    pageStatus.textContent = message || "";
    pageStatus.classList.toggle("hidden", !message);
    pageStatus.classList.remove("gt-status-err", "gt-status-ok");
    if (message && isError) {
      pageStatus.classList.add("gt-status-err");
    } else if (message) {
      pageStatus.classList.add("gt-status-ok");
    }
  }

  function setSaveStatus(message, isError = false) {
    if (!saveStatus) return;
    saveStatus.textContent = message || "";
    saveStatus.classList.toggle("hidden", !message);
    saveStatus.classList.remove("gt-status-err", "gt-status-ok");
    if (message && isError) {
      saveStatus.classList.add("gt-status-err");
    } else if (message) {
      saveStatus.classList.add("gt-status-ok");
    }
  }

  function setStartError(message) {
    if (!startError) return;
    startError.textContent = message || "";
    startError.classList.toggle("hidden", !message);
  }

  function allTeamsFullyAssigned() {
    if (teamCount === null || teamCount < MIN_TEAMS) return false;
    readAssignmentsFromDom();
    resizeAssignments(teamCount);
    return teamAssignments.every((t) => t.player1Id && t.player2Id);
  }

  function canStartTournament() {
    if (!editingId) {
      return { ok: false, message: "Save the tournament with Update Cornhole Tournament before starting." };
    }
    if (isDirty()) {
      return { ok: false, message: "Save your changes before starting the tournament." };
    }
    if (!currentName()) {
      return { ok: false, message: "Tournament name is required." };
    }
    if (!currentType()) {
      return { ok: false, message: "Select single or double elimination." };
    }
    if (teamCount === null) {
      return { ok: false, message: "Enter a valid number of teams (2–20)." };
    }
    if (!allTeamsFullyAssigned()) {
      return { ok: false, message: "Assign two players to every team before starting." };
    }
    return { ok: true, message: "" };
  }

  async function startTournament() {
    setStartError("");
    const check = canStartTournament();
    if (!check.ok) {
      setStartError(check.message);
      return;
    }

    const firstRoundMatchCount = teamCount !== null ? Math.floor(teamCount / 2) : 0;
    const oddFirstRoundMatches =
      currentType() === GameTracker.Cornhole.TOURNAMENT_TYPES.SINGLE_ELIMINATION &&
      firstRoundMatchCount % 2 === 1;

    const lockMessage =
      "Once the tournament is started, no changes to the tournament setup can be made.";

    function switchToDoubleElimination() {
      typeInputs.forEach((input) => {
        input.checked =
          input.value === GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION;
      });
      selectedType = GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION;
      syncSetup();
    }

    function confirmAndStart() {
      GameTracker.confirmModal({
        message: lockMessage,
        confirmLabel: "Start Tournament",
        cancelLabel: "Cancel",
        onConfirm: async () => {
          if (startBtn) startBtn.disabled = true;
          setStartError("");
          setSaveStatus("Starting tournament…");
          try {
            const type =
              currentType() || GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION;
            const teams = buildTeamsPayload().map((team, index) => ({
              ...team,
              id: team.id || savedTeams[index]?.id,
              name: team.name || `Team ${index + 1}`,
            }));
            teams.forEach((team, index) => {
              if (!team.id) team.id = `cteam_${Date.now()}_${index}`;
            });
            const matches = GameTracker.Cornhole.generateBracket(type, teams);
            const saved = await GameTracker.Cornhole.saveTournament({
              id: editingId,
              name: currentName(),
              type,
              teams,
              matches,
              status: GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE,
            });
            window.location.href = `active-cornhole.html?id=${encodeURIComponent(saved.id)}`;
          } catch (err) {
            setSaveStatus("");
            setStartError(err.message || "Could not start tournament.");
            if (startBtn) startBtn.disabled = false;
          }
        },
      });
    }

    if (oddFirstRoundMatches) {
      GameTracker.alertModal({
        message:
          "The tournament has been switched to double elimination due to odd number of matches in the first round.",
        okLabel: "OK",
        onOk: () => {
          switchToDoubleElimination();
          confirmAndStart();
        },
      });
      return;
    }

    confirmAndStart();
  }

  /**
   * @returns {CornholeTournamentType | ""}
   */
  function currentType() {
    const value = typeInputs.find((input) => input.checked)?.value || "";
    if (
      value === GameTracker.Cornhole.TOURNAMENT_TYPES.SINGLE_ELIMINATION ||
      value === GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION
    ) {
      return value;
    }
    return "";
  }

  function typeLabel(type) {
    if (type === GameTracker.Cornhole.TOURNAMENT_TYPES.SINGLE_ELIMINATION) {
      return "Single elimination";
    }
    if (type === GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION) {
      return "Double elimination";
    }
    return "";
  }

  function currentName() {
    return nameInput ? String(nameInput.value || "").trim() : "";
  }

  function isReservedName(name) {
    if (!reservedName) return false;
    return String(name || "").trim().toLowerCase() === String(reservedName).trim().toLowerCase();
  }

  function syncNameError() {
    if (!nameError) return;
    const name = currentName();
    if (!name) {
      nameError.textContent = "Name is required.";
      nameError.classList.remove("hidden");
      return;
    }
    if (isReservedName(name)) {
      nameError.textContent =
        "Choose a different name. The previous tournament already used this name.";
      nameError.classList.remove("hidden");
      return;
    }
    nameError.classList.add("hidden");
  }

  function syncPrepopulatedButtons() {
    clearAllBtn?.classList.toggle("hidden", !fromPrepopulated);
    lastResultsBtn?.classList.toggle("hidden", !fromPrepopulated);
  }

  function storeLastResults(tournament) {
    if (!tournament) return;
    try {
      sessionStorage.setItem(LAST_RESULTS_KEY, JSON.stringify(tournament));
    } catch {
      // Ignore storage failures.
    }
  }

  function clearAllFields() {
    suppressDirty = true;
    fromPrepopulated = false;
    reservedName = null;
    editingId = null;
    savedMatches = [];
    savedStatus = GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
    savedTeams = [];
    teamAssignments = [];
    selectedType = "";
    teamCount = null;

    if (nameInput) nameInput.value = "";
    typeInputs.forEach((input) => {
      input.checked = false;
    });
    if (teamCountInput) teamCountInput.value = "";

    renderTeams();
    syncSetupStatus();
    suppressDirty = false;
    markBaseline();
    clearFormDraft();
    clearSetupUrlId();
    syncNameError();
    setSaveStatus("");
    setStartError("");
    syncPrepopulatedButtons();
  }

  function openLastResults() {
    saveFormDraft();
    window.location.href = "active-cornhole.html?lastResults=1";
  }

  /**
   * @returns {number | null}
   */
  function parseTeamCount() {
    if (!teamCountInput) return null;
    const raw = String(teamCountInput.value ?? "").trim();
    if (raw === "") return null;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < MIN_TEAMS || value > MAX_TEAMS) {
      return null;
    }
    return value;
  }

  /**
   * @param {CornholePlayer} player
   */
  function playerLabel(player) {
    const nickname = player.nickname ? ` (${player.nickname})` : "";
    return `${player.name}${nickname}`;
  }

  /**
   * @param {string} playerId
   */
  function playerNameById(playerId) {
    if (!playerId) return "";
    const player = players.find((p) => String(p.id) === String(playerId));
    return player ? playerLabel(player) : "";
  }

  /**
   * @returns {Set<string>}
   */
  function selectedPlayerIds() {
    const ids = new Set();
    teamAssignments.forEach((team) => {
      if (team.player1Id) ids.add(team.player1Id);
      if (team.player2Id) ids.add(team.player2Id);
    });
    return ids;
  }

  function snapshotState() {
    readAssignmentsFromDom();
    return {
      name: currentName(),
      type: currentType(),
      teamCount: parseTeamCount(),
      teams: teamAssignments.map((team) => ({
        player1Id: team.player1Id || "",
        player2Id: team.player2Id || "",
      })),
    };
  }

  function statesEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function isDirty() {
    if (!baseline) return false;
    return !statesEqual(snapshotState(), baseline);
  }

  function syncDirtyUI() {
    if (suppressDirty) return;

    const snap = snapshotState();
    const dirty = !!(baseline && !statesEqual(snap, baseline));

    nameInput?.classList.toggle(
      "gt-pending",
      !!(baseline && snap.name !== baseline.name)
    );
    teamCountInput?.classList.toggle(
      "gt-pending",
      !!(baseline && snap.teamCount !== baseline.teamCount)
    );

    typeInputs.forEach((input) => {
      const typeChanged = !!(baseline && snap.type !== baseline.type);
      input.classList.toggle("gt-pending", typeChanged && input.checked);
      const label = input.closest("label");
      label?.classList.toggle("gt-pending", typeChanged && input.checked);
    });

    if (teamsList) {
      teamsList.querySelectorAll("[data-team-index]").forEach((row) => {
        const index = Number(row.getAttribute("data-team-index"));
        const saved = baseline?.teams?.[index] || { player1Id: "", player2Id: "" };
        const current = snap.teams[index] || { player1Id: "", player2Id: "" };
        const player1 = row.querySelector('select[data-slot="player1"]');
        const player2 = row.querySelector('select[data-slot="player2"]');
        player1?.classList.toggle(
          "gt-pending",
          (current.player1Id || "") !== (saved.player1Id || "")
        );
        player2?.classList.toggle(
          "gt-pending",
          (current.player2Id || "") !== (saved.player2Id || "")
        );
      });
    }

    if (dirty) {
      setSaveStatus(UNSAVED_MESSAGE, true);
    } else if (saveStatus && saveStatus.textContent === UNSAVED_MESSAGE) {
      setSaveStatus("");
    }

    if (saveBtn) {
      if (dirty) {
        saveBtn.classList.remove("gt-btn");
        saveBtn.classList.add("gt-btn-danger-solid");
      } else {
        saveBtn.classList.remove("gt-btn-danger-solid");
        saveBtn.classList.add("gt-btn");
      }
    }
  }

  function saveFormDraft() {
    readAssignmentsFromDom();
    if (teamCount !== null) {
      resizeAssignments(teamCount);
    }
    const draft = {
      editingId,
      name: nameInput ? nameInput.value : "",
      type: currentType(),
      teamCountValue: teamCountInput ? teamCountInput.value : "",
      teams: teamAssignments.map((team) => ({
        id: team.id || "",
        player1Id: team.player1Id || "",
        player2Id: team.player2Id || "",
      })),
      baseline,
      reservedName,
      fromPrepopulated,
      knownPlayerIds: players.map((player) => String(player.id || "")),
    };
    try {
      sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage failures; navigation still works.
    }
  }

  function readFormDraft() {
    let raw;
    try {
      raw = sessionStorage.getItem(FORM_DRAFT_KEY);
    } catch {
      return null;
    }
    if (!raw) return null;
    try {
      const draft = JSON.parse(raw);
      return draft && typeof draft === "object" ? draft : null;
    } catch {
      return null;
    }
  }

  function clearFormDraft() {
    try {
      sessionStorage.removeItem(FORM_DRAFT_KEY);
    } catch {
      // Ignore.
    }
  }

  /**
   * @param {object} draft
   * @returns {boolean}
   */
  function restoreFormDraft(draft) {
    if (!draft || typeof draft !== "object") return false;
    clearFormDraft();

    suppressDirty = true;

    if (nameInput && typeof draft.name === "string") {
      nameInput.value = draft.name;
    }

    const draftType = draft.type;
    if (
      draftType === GameTracker.Cornhole.TOURNAMENT_TYPES.SINGLE_ELIMINATION ||
      draftType === GameTracker.Cornhole.TOURNAMENT_TYPES.DOUBLE_ELIMINATION
    ) {
      typeInputs.forEach((input) => {
        input.checked = input.value === draftType;
      });
    }

    if (teamCountInput && draft.teamCountValue != null) {
      teamCountInput.value = String(draft.teamCountValue);
    }

    selectedType = currentType();
    teamCount = parseTeamCount();

    const draftTeams = Array.isArray(draft.teams) ? draft.teams : [];
    if (teamCount !== null) {
      teamAssignments = [];
      for (let i = 0; i < teamCount; i += 1) {
        const row = draftTeams[i] || {};
        teamAssignments.push({
          id: row.id || undefined,
          player1Id: row.player1Id || "",
          player2Id: row.player2Id || "",
        });
      }
    } else {
      teamAssignments = draftTeams.map((row) => ({
        id: row.id || undefined,
        player1Id: row.player1Id || "",
        player2Id: row.player2Id || "",
      }));
    }

    if (draft.baseline && typeof draft.baseline === "object") {
      baseline = {
        name: typeof draft.baseline.name === "string" ? draft.baseline.name : "",
        type: draft.baseline.type || "",
        teamCount:
          draft.baseline.teamCount === null || Number.isInteger(draft.baseline.teamCount)
            ? draft.baseline.teamCount
            : null,
        teams: Array.isArray(draft.baseline.teams)
          ? draft.baseline.teams.map((team) => ({
              player1Id: team?.player1Id || "",
              player2Id: team?.player2Id || "",
            }))
          : [],
      };
    }

    reservedName =
      typeof draft.reservedName === "string" && draft.reservedName.trim()
        ? draft.reservedName.trim()
        : null;
    fromPrepopulated = !!draft.fromPrepopulated;

    renderTeams();
    syncSetupStatus();
    suppressDirty = false;
    syncDirtyUI();
    syncNameError();
    syncPrepopulatedButtons();
    if (isDirty()) {
      setSaveStatus(UNSAVED_MESSAGE, true);
    }
    return true;
  }

  function updateAddPlayerLink() {
    if (!addPlayerLink) return;
    addPlayerLink.href = `players.html?returnTo=${encodeURIComponent(window.location.href)}`;
  }

  function markBaseline() {
    baseline = snapshotState();
    syncDirtyUI();
  }

  /**
   * @param {HTMLSelectElement} select
   * @param {string} selectedId
   * @param {Set<string>} takenIds
   */
  function fillPlayerSelect(select, selectedId, takenIds) {
    select.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select player…";
    select.appendChild(placeholder);

    players.forEach((player) => {
      const id = String(player.id);
      const option = document.createElement("option");
      option.value = id;
      const takenElsewhere = id !== selectedId && takenIds.has(id);
      if (takenElsewhere) {
        option.textContent = `${playerLabel(player)} (assigned)`;
        option.disabled = true;
        option.className = "gt-option-taken";
      } else {
        option.textContent = playerLabel(player);
      }
      select.appendChild(option);
    });

    const validSelection =
      selectedId &&
      [...select.options].some((o) => o.value === selectedId && !o.disabled);
    select.value = validSelection ? selectedId : "";
  }

  function readAssignmentsFromDom() {
    if (!teamsList) return;
    const seen = new Set();
    teamsList.querySelectorAll("[data-team-index]").forEach((row) => {
      const index = Number(row.getAttribute("data-team-index"));
      if (!Number.isInteger(index) || !teamAssignments[index]) return;
      const player1 = row.querySelector('select[data-slot="player1"]');
      const player2 = row.querySelector('select[data-slot="player2"]');
      let player1Id = player1 ? String(player1.value || "") : "";
      let player2Id = player2 ? String(player2.value || "") : "";

      if (player1Id && seen.has(player1Id)) player1Id = "";
      if (player1Id) seen.add(player1Id);
      if (player2Id && (seen.has(player2Id) || player2Id === player1Id)) player2Id = "";
      if (player2Id) seen.add(player2Id);

      teamAssignments[index].player1Id = player1Id;
      teamAssignments[index].player2Id = player2Id;
    });
  }

  function resizeAssignments(count) {
    const next = [];
    for (let i = 0; i < count; i += 1) {
      next.push({
        id: teamAssignments[i]?.id,
        player1Id: teamAssignments[i]?.player1Id || "",
        player2Id: teamAssignments[i]?.player2Id || "",
      });
    }
    teamAssignments = next;
  }

  function renderTeams() {
    if (!teamsList) return;

    readAssignmentsFromDom();

    if (teamCount === null) {
      teamsList.innerHTML = "";
      teamsHint?.classList.remove("hidden");
      syncDirtyUI();
      return;
    }

    teamsHint?.classList.add("hidden");
    resizeAssignments(teamCount);

    const taken = selectedPlayerIds();
    teamsList.innerHTML = "";

    for (let i = 0; i < teamCount; i += 1) {
      const assignment = teamAssignments[i];
      const row = document.createElement("div");
      row.className = "gt-panel-muted gt-cornhole-team";
      row.setAttribute("data-team-index", String(i));

      const title = document.createElement("h3");
      title.className = "gt-cornhole-team-title";
      title.textContent = `Team ${i + 1}`;
      row.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "grid gap-2 sm:grid-cols-2";

      ["player1", "player2"].forEach((slot, slotIndex) => {
        const field = document.createElement("div");
        const label = document.createElement("label");
        label.className = "gt-label";
        label.htmlFor = `team-${i + 1}-${slot}`;
        label.textContent = `Player ${slotIndex + 1}`;

        const select = document.createElement("select");
        select.id = `team-${i + 1}-${slot}`;
        select.name = `gtCornholeTeam${i + 1}${slot}`;
        select.className = "gt-input gt-input-compact";
        select.setAttribute("data-slot", slot);

        const selectedId = slot === "player1" ? assignment.player1Id : assignment.player2Id;
        fillPlayerSelect(select, selectedId, taken);

        select.addEventListener("change", () => {
          const chosen = String(select.value || "");
          if (chosen) {
            const takenNow = selectedPlayerIds();
            const prior =
              slot === "player1" ? assignment.player1Id : assignment.player2Id;
            if (chosen !== prior && takenNow.has(chosen)) {
              select.value = prior || "";
              return;
            }
          }
          readAssignmentsFromDom();
          renderTeams();
          syncSetupStatus();
          syncDirtyUI();
        });

        field.append(label, select);
        grid.appendChild(field);
      });

      row.appendChild(grid);
      teamsList.appendChild(row);
    }

    syncDirtyUI();
  }

  function syncSetupStatus() {
    if (!setupStatus) return;
    const parts = [];
    if (selectedType) parts.push(typeLabel(selectedType));
    if (teamCount !== null) {
      parts.push(`${teamCount} team${teamCount === 1 ? "" : "s"}`);
    }
    const filled = teamAssignments.filter((t) => t.player1Id && t.player2Id).length;
    if (teamCount !== null && players.length > 0) {
      parts.push(`${filled}/${teamCount} teams assigned`);
    }
    if (editingId) parts.push("saved draft");
    if (parts.length > 0) {
      setupStatus.textContent = `${parts.join(" · ")}.`;
      setupStatus.classList.remove("hidden");
    } else {
      setupStatus.textContent = "";
      setupStatus.classList.add("hidden");
    }
  }

  function syncSetup() {
    selectedType = currentType();
    const previousCount = teamCount;
    teamCount = parseTeamCount();

    if (typeError) {
      typeError.classList.toggle("hidden", !!selectedType);
    }

    const teamCountTouched =
      teamCountInput && String(teamCountInput.value ?? "").trim() !== "";
    if (teamCountError) {
      teamCountError.classList.toggle("hidden", !teamCountTouched || teamCount !== null);
    }

    if (nameError) {
      syncNameError();
    }

    if (previousCount !== teamCount) {
      renderTeams();
    } else {
      syncDirtyUI();
    }
    syncSetupStatus();
  }

  /**
   * @param {CornholeTournament} tournament
   */
  function applyTournament(tournament) {
    suppressDirty = true;
    reservedName = null;
    fromPrepopulated = false;
    editingId = tournament.id || null;
    savedMatches = Array.isArray(tournament.matches) ? tournament.matches : [];
    savedStatus = tournament.status || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;

    if (nameInput) {
      nameInput.value = tournament.name || "Cornhole Tournament";
    }

    typeInputs.forEach((input) => {
      input.checked = input.value === tournament.type;
    });

    const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
    if (teamCountInput) {
      teamCountInput.value = String(Math.max(teams.length, MIN_TEAMS));
    }

    teamAssignments = teams.map((team, index) => ({
      id: team.id,
      player1Id: team.player1Id || "",
      player2Id: team.player2Id || "",
    }));
    savedTeams = teams.map((team) => ({ ...team }));

    selectedType = currentType();
    teamCount = parseTeamCount();
    renderTeams();
    syncSetupStatus();
    suppressDirty = false;
    markBaseline();
    syncNameError();
    syncPrepopulatedButtons();
  }

  /**
   * Copy setup from a finished tournament into a new unsaved draft.
   * @param {CornholeTournament} tournament
   */
  function applyPrepopulatedFrom(tournament) {
    suppressDirty = true;
    editingId = null;
    savedMatches = [];
    savedStatus = GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
    savedTeams = [];
    fromPrepopulated = true;
    reservedName = String(tournament.name || "").trim() || null;
    storeLastResults(tournament);

    if (nameInput) {
      nameInput.value = tournament.name || "Cornhole Tournament";
    }

    typeInputs.forEach((input) => {
      input.checked = input.value === tournament.type;
    });

    const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
    if (teamCountInput) {
      teamCountInput.value = String(Math.max(teams.length, MIN_TEAMS));
    }

    teamAssignments = teams.map((team) => ({
      player1Id: team.player1Id || "",
      player2Id: team.player2Id || "",
    }));

    selectedType = currentType();
    teamCount = parseTeamCount();
    renderTeams();
    syncSetupStatus();
    suppressDirty = false;

    // Empty baseline so every pre-filled field counts as unsaved.
    baseline = {
      name: "",
      type: "",
      teamCount: null,
      teams: teamAssignments.map(() => ({ player1Id: "", player2Id: "" })),
    };
    syncDirtyUI();
    syncNameError();
    syncPrepopulatedButtons();
    setSaveStatus(UNSAVED_MESSAGE, true);
  }

  function clearSetupUrlId() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("id")) return;
    params.delete("id");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      query ? `${window.location.pathname}?${query}` : window.location.pathname
    );
  }

  function buildTeamsPayload() {
    readAssignmentsFromDom();
    resizeAssignments(teamCount || 0);
    return teamAssignments.map((team, index) => ({
      id: team.id || undefined,
      name: `Team ${index + 1}`,
      player1Id: team.player1Id || "",
      player2Id: team.player2Id || "",
      player1Name: playerNameById(team.player1Id || ""),
      player2Name: playerNameById(team.player2Id || ""),
    }));
  }

  function validateForSave() {
    const name = currentName();
    selectedType = currentType();
    teamCount = parseTeamCount();

    let ok = true;
    syncNameError();
    if (!name || isReservedName(name)) {
      ok = false;
    }
    if (!selectedType) {
      typeError?.classList.remove("hidden");
      ok = false;
    } else {
      typeError?.classList.add("hidden");
    }
    if (teamCount === null) {
      teamCountError?.classList.remove("hidden");
      ok = false;
    } else {
      teamCountError?.classList.add("hidden");
    }
    return ok;
  }

  async function saveTournament() {
    if (!validateForSave()) {
      if (isReservedName(currentName())) {
        setSaveStatus("Change the tournament name before saving.", true);
      } else {
        setSaveStatus("Fix the highlighted setup fields, then try again.", true);
      }
      return;
    }

    const payload = {
      name: currentName(),
      type: selectedType,
      teams: buildTeamsPayload(),
      matches: savedMatches,
      status: savedStatus || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP,
    };
    if (editingId) {
      payload.id = editingId;
    }

    if (saveBtn) saveBtn.disabled = true;
    setSaveStatus("Saving tournament…");

    try {
      const saved = await GameTracker.Cornhole.saveTournament(payload);
      suppressDirty = true;
      reservedName = null;
      fromPrepopulated = false;
      editingId = saved.id;
      savedMatches = Array.isArray(saved.matches) ? saved.matches : [];
      savedStatus = saved.status || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
      if (Array.isArray(saved.teams)) {
        teamAssignments = saved.teams.map((team) => ({
          id: team.id,
          player1Id: team.player1Id || "",
          player2Id: team.player2Id || "",
        }));
        savedTeams = saved.teams.map((team) => ({ ...team }));
        renderTeams();
      }
      const params = new URLSearchParams(window.location.search);
      params.set("id", saved.id);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", nextUrl);
      if (addPlayerLink) {
        updateAddPlayerLink();
      }
      syncSetupStatus();
      suppressDirty = false;
      markBaseline();
      clearFormDraft();
      syncNameError();
      syncPrepopulatedButtons();
      setSaveStatus("Cornhole tournament saved. You can leave and update it later.");
    } catch (err) {
      setSaveStatus(err.message || "Could not save tournament.", true);
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  /**
   * @param {CornholeTournament[]} tournaments
   * @returns {CornholeTournament | null}
   */
  function pickDraftTournament(tournaments) {
    const drafts = tournaments.filter(
      (t) => t && t.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP
    );
    if (drafts.length === 0) return null;
    drafts.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return drafts[0];
  }

  /**
   * @param {CornholeTournament[]} tournaments
   * @returns {CornholeTournament | null}
   */
  function pickLatestCompleted(tournaments) {
    const completed = tournaments.filter(
      (t) => t && t.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED
    );
    if (completed.length === 0) return null;
    completed.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
    return completed[0];
  }

  typeInputs.forEach((input) => {
    input.addEventListener("change", syncSetup);
  });
  if (teamCountInput) {
    teamCountInput.addEventListener("input", syncSetup);
    teamCountInput.addEventListener("change", syncSetup);
  }
  if (nameInput) {
    nameInput.addEventListener("input", syncSetup);
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      clearAllFields();
    });
  }
  if (lastResultsBtn) {
    lastResultsBtn.addEventListener("click", () => {
      openLastResults();
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveTournament();
    });
  }
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startTournament();
    });
  }

  async function load() {
    try {
      players = await GameTracker.Cornhole.fetchPlayers();
      if (players.length === 0) {
        setStatus("");
        playersEmpty?.classList.remove("hidden");
        teamsHint?.classList.add("hidden");
        if (teamsList) teamsList.innerHTML = "";
      } else {
        playersEmpty?.classList.add("hidden");
        setStatus(
          `${players.length} player${players.length === 1 ? "" : "s"} available for team assignment.`
        );
      }

      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const formDraft = readFormDraft();
      const tournaments = await GameTracker.Cornhole.fetchTournaments();
      const active = tournaments.find(
        (t) => t && t.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE
      );
      if (active) {
        clearFormDraft();
        window.location.href = `active-cornhole.html?id=${encodeURIComponent(active.id)}`;
        return;
      }

      const loadId = id || (formDraft && formDraft.editingId) || "";
      if (loadId) {
        const tournament = await GameTracker.Cornhole.fetchTournament(loadId);
        if (tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE) {
          clearFormDraft();
          window.location.href = `active-cornhole.html?id=${encodeURIComponent(tournament.id)}`;
          return;
        }
        if (tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP) {
          applyTournament(tournament);
          if (!params.get("id")) {
            params.set("id", tournament.id);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          }
          if (!formDraft) {
            setSaveStatus("Loaded saved Cornhole tournament.");
          }
        } else if (
          tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED &&
          !formDraft
        ) {
          applyPrepopulatedFrom(tournament);
          clearSetupUrlId();
        } else if (!formDraft) {
          suppressDirty = true;
          renderTeams();
          syncSetupStatus();
          suppressDirty = false;
          markBaseline();
        }
      } else if (!formDraft) {
        const draft = pickDraftTournament(tournaments);
        if (draft) {
          applyTournament(draft);
          params.set("id", draft.id);
          window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          setSaveStatus("Loaded your in-progress Cornhole tournament.");
        } else {
          const previous = pickLatestCompleted(tournaments);
          if (previous) {
            applyPrepopulatedFrom(previous);
          } else {
            suppressDirty = true;
            renderTeams();
            syncSetupStatus();
            suppressDirty = false;
            markBaseline();
          }
        }
      } else {
        suppressDirty = true;
        renderTeams();
        syncSetupStatus();
        suppressDirty = false;
        markBaseline();
      }

      if (formDraft) {
        restoreFormDraft(formDraft);
      }
      updateAddPlayerLink();
    } catch (err) {
      setStatus(err.message || "Could not load Cornhole data.", true);
      playersEmpty?.classList.add("hidden");
      teamsHint?.classList.add("hidden");
      if (teamsList) teamsList.innerHTML = "";
    }
  }

  syncSetup();
  if (addPlayerLink) {
    updateAddPlayerLink();
    addPlayerLink.addEventListener("click", () => {
      saveFormDraft();
    });
  }
  load();
})();
