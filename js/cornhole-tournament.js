(() => {
  const pageStatus = document.getElementById("page-status");
  const teamsList = document.getElementById("teams-list");
  const teamsHint = document.getElementById("teams-hint");
  const teamsSection = document.getElementById("teams-section");
  const playersEmpty = document.getElementById("players-empty");
  const setupStep1 = document.getElementById("setup-step-1");
  const setupStep2 = document.getElementById("setup-step-2");
  const setupStep3 = document.getElementById("setup-step-3");
  const setupStep4 = document.getElementById("setup-step-4");
  const setupStepIndicator = document.getElementById("setup-step-indicator");
  const playerPickerList = document.getElementById("player-picker-list");
  const playerSelectedList = document.getElementById("player-selected-list");
  const playerPickerStatus = document.getElementById("player-picker-status");
  const playerPickerError = document.getElementById("player-picker-error");
  const donePlayersBtn = document.getElementById("done-players-btn");
  const changePlayersBtn = document.getElementById("change-players-btn");
  const setupNextBtn = document.getElementById("setup-next-btn");
  const setupBackBtn = document.getElementById("setup-back-btn");
  const setupBackBtn2 = document.getElementById("setup-back-btn-2");
  const setupBackBtn3 = document.getElementById("setup-back-btn-3");
  const addMoreTeamsBtn = document.getElementById("add-more-teams-btn");
  const assignTeamsBtn = document.getElementById("assign-teams-btn");
  const randomizeTeamsBtn = document.getElementById("randomize-teams-btn");
  const typeInputs = Array.from(document.querySelectorAll('input[name="gtCornholeType"]'));
  const typeError = document.getElementById("type-error");
  const teamCountInput = document.getElementById("team-count");
  const teamCountError = document.getElementById("team-count-error");
  const nameInput = document.getElementById("tournament-name");
  const nameError = document.getElementById("name-error");
  const lastResultsBtn = document.getElementById("last-results-btn");
  const keepExistingPlayersBtn = document.getElementById("keep-existing-players-btn");
  const setupStatus = document.getElementById("setup-status");
  const saveStatus = document.getElementById("save-status");
  const startBtn = document.getElementById("start-tournament-btn");
  const startError = document.getElementById("start-error");
  const addPlayerLink = document.getElementById("add-player-link");

  const MIN_TEAMS = GameTracker.Cornhole.MIN_TEAMS;
  const MAX_TEAMS = GameTracker.Cornhole.MAX_TEAMS;
  const MIN_PLAYERS = MIN_TEAMS * 2;
  const MAX_PLAYERS = MAX_TEAMS * 2;
  const UNSAVED_MESSAGE = "Unsaved changes will be saved when you start.";
  const FORM_DRAFT_KEY = "gametracker.cornholeFormDraft";
  const LAST_RESULTS_KEY = "gametracker.cornholeLastResults";
  const PHASE_SETUP = "setup";
  const PHASE_PICKING = "picking";
  const PHASE_CHOOSE = "chooseMode";
  const PHASE_TEAMS = "teamsReady";

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
  /** @type {CornholeTournament | null} */
  let existingTournamentSource = null;
  /** True after Keep-all-players has been used once this draft. */
  let keepExistingPlayersUsed = false;
  /** Players chosen for this tournament (before / while assigning teams). */
  /** @type {Set<string>} */
  let tournamentPlayerIds = new Set();
  /** @type {"setup"|"picking"|"chooseMode"|"teamsReady"} */
  let setupPhase = PHASE_SETUP;
  /** True when Step 4 teams came from Random Teams (no player dropdowns). */
  let teamsLockedFromRandom = false;

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
    syncAssignmentsFromUi();
    resizeAssignments(teamCount);
    return teamAssignments.every((t) => t.player1Id && t.player2Id);
  }

  function canStartTournament() {
    if (!currentName()) {
      return { ok: false, message: "Tournament name is required." };
    }
    if (!currentType()) {
      return { ok: false, message: "Select single or double elimination." };
    }
    if (teamCount === null) {
      return { ok: false, message: "Select an even number of players and place them on teams first." };
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

    if (!editingId || isDirty()) {
      const saved = await saveTournament({ quiet: true });
      if (!saved) return;
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
    lastResultsBtn?.classList.toggle("hidden", !getExistingTournamentSource());
    syncKeepExistingPlayersButton();
  }

  function rememberPreviousTournament(tournament) {
    if (!tournament) return;
    existingTournamentSource = tournament;
    reservedName = String(tournament.name || "").trim() || null;
    storeLastResults(tournament);
  }

  function initBlankStep1() {
    if (nameInput) nameInput.value = "";
    typeInputs.forEach((input) => {
      input.checked = false;
    });
    selectedType = "";
    fromPrepopulated = false;
    reservedName = null;
    nameError?.classList.add("hidden");
    typeError?.classList.add("hidden");
  }

  /** Clear Step 1 inputs without dropping prior-tournament memory. */
  function clearStep1Fields() {
    if (nameInput) nameInput.value = "";
    typeInputs.forEach((input) => {
      input.checked = false;
    });
    selectedType = "";
    nameError?.classList.add("hidden");
    typeError?.classList.add("hidden");
  }

  function startFreshSetup(options = {}) {
    suppressDirty = true;
    editingId = null;
    savedMatches = [];
    savedStatus = GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
    savedTeams = [];
    teamAssignments = [];
    tournamentPlayerIds = new Set();
    teamsLockedFromRandom = false;
    keepExistingPlayersUsed = false;
    setDerivedTeamCount(null);
    setupPhase = PHASE_SETUP;
    initBlankStep1();
    if (options.previousTournament) {
      rememberPreviousTournament(options.previousTournament);
    }
    if (teamsList) teamsList.innerHTML = "";
    renderPlayerPicker();
    renderTeams({ fromMemory: true });
    syncPhaseUI();
    syncSetupStatus();
    suppressDirty = false;
    baseline = {
      name: "",
      type: "",
      teamCount: null,
      teams: [],
    };
    syncDirtyUI();
    syncPrepopulatedButtons();
    setSaveStatus("");
  }

  /**
   * @returns {CornholeTournament | null}
   */
  function getExistingTournamentSource() {
    if (existingTournamentSource) return existingTournamentSource;
    try {
      const raw = sessionStorage.getItem(LAST_RESULTS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function countPlayersOnTeams(teams) {
    let count = 0;
    (teams || []).forEach((team) => {
      if (team?.player1Id) count += 1;
      if (team?.player2Id) count += 1;
    });
    return count;
  }

  function syncKeepExistingPlayersButton() {
    if (!keepExistingPlayersBtn) return;
    const source = getExistingTournamentSource();
    const teams = Array.isArray(source?.teams) ? source.teams : [];
    const show =
      setupPhase === PHASE_PICKING &&
      !keepExistingPlayersUsed &&
      countPlayersOnTeams(teams) >= MIN_PLAYERS;
    keepExistingPlayersBtn.classList.toggle("hidden", !show);
  }

  function keepAllPlayersFromExisting() {
    const source = getExistingTournamentSource();
    const teams = Array.isArray(source?.teams) ? source.teams : [];
    if (countPlayersOnTeams(teams) < MIN_PLAYERS) return;

    keepExistingPlayersUsed = true;
    syncPoolFromTeams(teams);
    setPlayerPickerError("");
    setupPhase = PHASE_PICKING;
    renderPlayerPicker();
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function storeLastResults(tournament) {
    if (!tournament) return;
    try {
      sessionStorage.setItem(LAST_RESULTS_KEY, JSON.stringify(tournament));
    } catch {
      // Ignore storage failures.
    }
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
   * @param {number | null} count
   */
  function setDerivedTeamCount(count) {
    teamCount = count;
    if (teamCountInput) {
      teamCountInput.value = count === null ? "" : String(count);
    }
    const display = document.getElementById("team-count-display");
    if (display) {
      display.textContent = count === null ? "—" : String(count);
    }
  }

  /**
   * @param {CornholePlayer} player
   */
  function playerLabel(player) {
    const nickname = player.nickname ? ` (${player.nickname})` : "";
    return `${player.name}${nickname}`;
  }

  /**
   * @param {CornholePlayer} a
   * @param {CornholePlayer} b
   */
  function byPlayerName(a, b) {
    return playerLabel(a).localeCompare(playerLabel(b), undefined, {
      sensitivity: "base",
    });
  }

  /**
   * @param {string} message
   */
  function setPlayerPickerError(message) {
    if (!playerPickerError) return;
    playerPickerError.textContent = message || "";
    playerPickerError.classList.toggle("hidden", !message);
  }

  /**
   * @returns {{ ok: boolean, message: string, teamCount: number | null }}
   */
  function validateTournamentPlayerPool() {
    const count = tournamentPlayerIds.size;
    if (count === 0) {
      return {
        ok: false,
        message: "Select players for the tournament.",
        teamCount: null,
      };
    }
    if (count % 2 !== 0) {
      return {
        ok: false,
        message: "The number of players must be even (two players per team).",
        teamCount: null,
      };
    }
    const teams = count / 2;
    if (teams < MIN_TEAMS || teams > MAX_TEAMS) {
      return {
        ok: false,
        message: `Select ${MIN_PLAYERS}–${MAX_PLAYERS} players (${MIN_TEAMS}–${MAX_TEAMS} teams).`,
        teamCount: null,
      };
    }
    return { ok: true, message: "", teamCount: teams };
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
   * @param {string} playerId
   * @returns {{ teamIndex: number, slot: "player1"|"player2" }|null}
   */
  function findPlayerAssignment(playerId) {
    if (!playerId) return null;
    for (let i = 0; i < teamAssignments.length; i += 1) {
      const team = teamAssignments[i];
      if (team.player1Id === playerId) return { teamIndex: i, slot: "player1" };
      if (team.player2Id === playerId) return { teamIndex: i, slot: "player2" };
    }
    return null;
  }

  /**
   * @returns {Set<string>}
   */
  function assignedPlayerIds() {
    const ids = new Set();
    teamAssignments.forEach((team) => {
      if (team.player1Id) ids.add(String(team.player1Id));
      if (team.player2Id) ids.add(String(team.player2Id));
    });
    return ids;
  }

  /**
   * @param {{ id?: string, player1Id?: string, player2Id?: string }[]} teams
   */
  function syncPoolFromTeams(teams) {
    tournamentPlayerIds = new Set();
    mergePoolFromTeams(teams);
  }

  /**
   * Add assigned player ids to the tournament pool without removing existing selections.
   * @param {{ id?: string, player1Id?: string, player2Id?: string }[]} teams
   */
  function mergePoolFromTeams(teams) {
    (teams || []).forEach((team) => {
      if (team.player1Id) tournamentPlayerIds.add(String(team.player1Id));
      if (team.player2Id) tournamentPlayerIds.add(String(team.player2Id));
    });
  }

  function snapshotState() {
    syncAssignmentsFromUi();
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

    if (startBtn && setupPhase === PHASE_TEAMS) {
      if (dirty) {
        startBtn.classList.remove("gt-btn-warn");
        startBtn.classList.add("gt-btn-danger-solid");
      } else {
        startBtn.classList.remove("gt-btn-danger-solid");
        startBtn.classList.add("gt-btn-warn");
      }
    }
  }

  function saveFormDraft() {
    syncAssignmentsFromUi();
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
      tournamentPlayerIds: [...tournamentPlayerIds],
      setupPhase,
      teamsLockedFromRandom,
      baseline,
      reservedName,
      fromPrepopulated,
      keepExistingPlayersUsed,
      existingTournamentSource: existingTournamentSource
        ? {
            name: existingTournamentSource.name || "",
            type: existingTournamentSource.type || "",
            teams: Array.isArray(existingTournamentSource.teams)
              ? existingTournamentSource.teams.map((team) => ({
                  player1Id: team?.player1Id || "",
                  player2Id: team?.player2Id || "",
                }))
              : [],
          }
        : null,
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
   * True when the draft was saved mid-wizard (Step 2+) so we should restore it
   * after returning from Add Player / last results — not a stale Step 1 name.
   * @param {object|null} draft
   * @returns {boolean}
   */
  function isMidWizardFormDraft(draft) {
    if (!draft || typeof draft !== "object") return false;
    if (
      draft.setupPhase === PHASE_PICKING ||
      draft.setupPhase === PHASE_CHOOSE ||
      draft.setupPhase === PHASE_TEAMS
    ) {
      return true;
    }
    if (
      Array.isArray(draft.tournamentPlayerIds) &&
      draft.tournamentPlayerIds.some((id) => String(id || "").trim())
    ) {
      return true;
    }
    if (
      Array.isArray(draft.teams) &&
      draft.teams.some((team) => team?.player1Id || team?.player2Id)
    ) {
      return true;
    }
    return false;
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

    if (Array.isArray(draft.tournamentPlayerIds)) {
      tournamentPlayerIds = new Set(
        draft.tournamentPlayerIds.map((id) => String(id || "")).filter(Boolean)
      );
    } else {
      syncPoolFromTeams(teamAssignments);
    }

    if (
      draft.setupPhase === PHASE_SETUP ||
      draft.setupPhase === PHASE_PICKING ||
      draft.setupPhase === PHASE_CHOOSE ||
      draft.setupPhase === PHASE_TEAMS
    ) {
      setupPhase = draft.setupPhase;
    } else if (teamCount !== null && teamAssignments.some((t) => t.player1Id || t.player2Id)) {
      setupPhase = PHASE_TEAMS;
    } else if (tournamentPlayerIds.size > 0 && teamCount !== null) {
      setupPhase = PHASE_CHOOSE;
    } else if (tournamentPlayerIds.size > 0) {
      setupPhase = PHASE_PICKING;
    } else {
      setupPhase = PHASE_SETUP;
    }

    teamsLockedFromRandom = !!draft.teamsLockedFromRandom;

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
    keepExistingPlayersUsed = !!draft.keepExistingPlayersUsed;
    if (draft.existingTournamentSource && typeof draft.existingTournamentSource === "object") {
      existingTournamentSource = {
        name: draft.existingTournamentSource.name || "",
        type: draft.existingTournamentSource.type || "",
        teams: Array.isArray(draft.existingTournamentSource.teams)
          ? draft.existingTournamentSource.teams
          : [],
      };
    }

    renderPlayerPicker();
    renderTeams({ fromMemory: true });
    syncPhaseUI();
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
    placeholder.className = "gt-option-placeholder";
    select.appendChild(placeholder);

    const pool = players.filter((player) =>
      tournamentPlayerIds.has(String(player.id))
    );

    const unassigned = pool
      .filter((player) => !takenIds.has(String(player.id)))
      .sort(byPlayerName);
    const assigned = pool
      .filter((player) => takenIds.has(String(player.id)))
      .sort(byPlayerName);

    [...unassigned, ...assigned].forEach((player) => {
      const id = String(player.id);
      const option = document.createElement("option");
      option.value = id;
      const takenElsewhere = id !== selectedId && takenIds.has(id);
      if (takenElsewhere) {
        option.textContent = `${playerLabel(player)} (assigned)`;
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
    select.classList.toggle("gt-select-empty", !select.value);
  }

  function renderPlayerPicker() {
    if (!playerPickerList) return;
    playerPickerList.innerHTML = "";
    if (playerSelectedList) playerSelectedList.innerHTML = "";

    const picking = setupPhase === PHASE_PICKING;
    const unselected = players
      .filter((player) => !tournamentPlayerIds.has(String(player.id)))
      .sort(byPlayerName);
    const selected = players
      .filter((player) => tournamentPlayerIds.has(String(player.id)))
      .sort(byPlayerName);

    function appendPlayerRow(container, player, isSelected) {
      if (!container) return;
      const id = String(player.id);
      const row = document.createElement("label");
      row.className =
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-ink hover:bg-parchment/80";
      if (isSelected) row.classList.add("bg-gold/20");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "border-wood/40 text-felt focus:ring-felt/30";
      checkbox.value = id;
      checkbox.checked = isSelected;
      checkbox.disabled = !picking;
      checkbox.addEventListener("change", () => {
        if (!picking) return;
        if (checkbox.checked) tournamentPlayerIds.add(id);
        else tournamentPlayerIds.delete(id);
        setPlayerPickerError("");
        renderPlayerPicker();
        syncConfirmPlayersButton();
        syncDirtyUI();
      });

      const text = document.createElement("span");
      text.textContent = playerLabel(player);
      row.append(checkbox, text);
      container.appendChild(row);
    }

    if (unselected.length === 0) {
      const empty = document.createElement("p");
      empty.className = "px-2 py-1.5 text-sm gt-muted";
      empty.textContent = "All players selected.";
      playerPickerList.appendChild(empty);
    } else {
      unselected.forEach((player) => appendPlayerRow(playerPickerList, player, false));
    }

    if (selected.length === 0 && playerSelectedList) {
      const empty = document.createElement("p");
      empty.className = "px-2 py-1.5 text-sm gt-muted";
      empty.textContent = "No players selected yet.";
      playerSelectedList.appendChild(empty);
    } else {
      selected.forEach((player) => appendPlayerRow(playerSelectedList, player, true));
    }

    syncConfirmPlayersButton();
    updatePlayerPickerStatus();
  }

  function updatePlayerPickerStatus() {
    if (!playerPickerStatus) return;
    const count = tournamentPlayerIds.size;
    if (players.length === 0) {
      playerPickerStatus.textContent = "";
      playerPickerStatus.classList.remove("text-red-600");
      playerPickerStatus.classList.add("gt-muted");
      return;
    }
    const teams = count % 2 === 0 ? count / 2 : null;
    let detail = `${count} selected`;
    let isError = false;
    if (count === 0) {
      detail =
        "Select players from the left box; they move to Selected players on the right. Total must be even.";
    } else if (count % 2 !== 0) {
      detail = "Must have even number of players.";
      isError = true;
    } else if (teams !== null && (teams < MIN_TEAMS || teams > MAX_TEAMS)) {
      detail = `${count} selected → ${teams} teams (need ${MIN_TEAMS}–${MAX_TEAMS} teams)`;
    } else if (teams !== null) {
      detail = `${count} selected → ${teams} team${teams === 1 ? "" : "s"}`;
    }
    playerPickerStatus.textContent = detail;
    playerPickerStatus.classList.toggle("text-red-600", isError);
    playerPickerStatus.classList.toggle("gt-muted", !isError);
  }

  function syncConfirmPlayersButton() {
    const check = validateTournamentPlayerPool();
    if (donePlayersBtn) {
      donePlayersBtn.disabled = setupPhase !== PHASE_PICKING || !check.ok;
    }
  }

  function updateStepIndicator() {
    if (!setupStepIndicator) return;
    const stepNumber = {
      [PHASE_SETUP]: 1,
      [PHASE_PICKING]: 2,
      [PHASE_CHOOSE]: 3,
      [PHASE_TEAMS]: 4,
    };
    const titles = {
      [PHASE_SETUP]: "Name and elimination type",
      [PHASE_PICKING]: "Select players",
      [PHASE_CHOOSE]: "Assign or randomize teams",
      [PHASE_TEAMS]: "Teams and Start",
    };
    const step = stepNumber[setupPhase] || 1;
    const title = titles[setupPhase] || titles[PHASE_SETUP];
    const stepsLeft = 4 - step;
    let leftText = "";
    if (stepsLeft === 1) leftText = " · 1 step left";
    else if (stepsLeft > 1) leftText = ` · ${stepsLeft} steps left`;
    setupStepIndicator.textContent = `Step ${step} of 4 — ${title}${leftText}`;
  }

  function syncPhaseUI() {
    const isSetup = setupPhase === PHASE_SETUP;
    const picking = setupPhase === PHASE_PICKING;
    const choose = setupPhase === PHASE_CHOOSE;
    const teams = setupPhase === PHASE_TEAMS;

    setupStep1?.classList.toggle("hidden", !isSetup);
    setupStep2?.classList.toggle("hidden", !picking);
    setupStep3?.classList.toggle("hidden", !choose);
    setupStep4?.classList.toggle("hidden", !teams);

    changePlayersBtn?.classList.toggle("hidden", true);
    if (donePlayersBtn) {
      donePlayersBtn.classList.toggle("hidden", !picking);
    }

    if (playerPickerList) {
      playerPickerList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        el.disabled = !picking;
      });
    }
    if (playerSelectedList) {
      playerSelectedList.querySelectorAll('input[type="checkbox"]').forEach((el) => {
        el.disabled = !picking;
      });
    }

    if (teams && teamCount !== null) {
      teamsHint?.classList.add("hidden");
    } else if (teamsHint) {
      teamsHint.classList.toggle("hidden", !teams);
    }

    updateStepIndicator();
    syncConfirmPlayersButton();
    updatePlayerPickerStatus();
    syncKeepExistingPlayersButton();
  }

  function goToPlayerStep() {
    syncNameError();
    const name = currentName();
    selectedType = currentType();
    let ok = true;
    if (!name || isReservedName(name)) {
      syncNameError();
      ok = false;
    }
    if (!selectedType) {
      typeError?.classList.remove("hidden");
      ok = false;
    } else {
      typeError?.classList.add("hidden");
    }
    if (!ok) return;
    setupPhase = PHASE_PICKING;
    renderPlayerPicker();
    syncPhaseUI();
    syncDirtyUI();
  }

  function goBackToSetup() {
    setupPhase = PHASE_SETUP;
    syncPhaseUI();
    syncDirtyUI();
  }

  function goBackToPicking() {
    setupPhase = PHASE_PICKING;
    teamsLockedFromRandom = false;
    setDerivedTeamCount(null);
    teamAssignments = [];
    if (teamsList) teamsList.innerHTML = "";
    renderPlayerPicker();
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function goBackToChoose() {
    function resetToChoose() {
      setupPhase = PHASE_CHOOSE;
      teamsLockedFromRandom = false;
      teamAssignments.forEach((team) => {
        team.player1Id = "";
        team.player2Id = "";
      });
      if (teamsList) teamsList.innerHTML = "";
      syncPhaseUI();
      syncSetupStatus();
      syncDirtyUI();
    }

    const hasAssignments = teamAssignments.some((t) => t.player1Id || t.player2Id);
    if (hasAssignments) {
      GameTracker.confirmModal({
        message: "Going back will clear current team assignments. Continue?",
        confirmLabel: "Go back",
        cancelLabel: "Cancel",
        onConfirm: resetToChoose,
      });
      return;
    }
    resetToChoose();
  }

  /**
   * @param {string[]} ids
   */
  function randomizeTeamAssignments(ids) {
    const shuffled = ids.slice();
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    const next = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      next.push({
        id: teamAssignments[next.length]?.id,
        player1Id: shuffled[i] || "",
        player2Id: shuffled[i + 1] || "",
      });
    }
    teamAssignments = next;
  }

  function confirmAllPlayersSelected() {
    const check = validateTournamentPlayerPool();
    if (!check.ok) {
      setPlayerPickerError(check.message);
      teamCountError?.classList.remove("hidden");
      return;
    }
    setPlayerPickerError("");
    teamCountError?.classList.add("hidden");
    setDerivedTeamCount(check.teamCount);
    resizeAssignments(check.teamCount);
    // Drop assignments for players no longer in the pool.
    teamAssignments.forEach((team) => {
      if (team.player1Id && !tournamentPlayerIds.has(String(team.player1Id))) {
        team.player1Id = "";
      }
      if (team.player2Id && !tournamentPlayerIds.has(String(team.player2Id))) {
        team.player2Id = "";
      }
    });
    const hasExistingAssignments = teamAssignments.some(
      (t) => t.player1Id || t.player2Id
    );
    if (hasExistingAssignments) {
      setupPhase = PHASE_TEAMS;
      teamsLockedFromRandom = false;
    } else {
      setupPhase = PHASE_CHOOSE;
    }
    if (teamsList) teamsList.innerHTML = "";
    renderPlayerPicker();
    renderTeams({ fromMemory: true });
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function changeSelectedPlayers() {
    function resetToPicking() {
      setupPhase = PHASE_PICKING;
      teamsLockedFromRandom = false;
      setDerivedTeamCount(null);
      teamAssignments = [];
      if (teamsList) teamsList.innerHTML = "";
      renderPlayerPicker();
      syncPhaseUI();
      syncSetupStatus();
      syncDirtyUI();
    }

    const hasAssignments = teamAssignments.some((t) => t.player1Id || t.player2Id);
    if (hasAssignments) {
      GameTracker.confirmModal({
        message:
          "Changing selected players will clear current team assignments. Continue?",
        confirmLabel: "Change players",
        cancelLabel: "Cancel",
        onConfirm: resetToPicking,
      });
      return;
    }
    resetToPicking();
  }

  function goToAddMoreTeams() {
    syncAssignmentsFromUi();
    teamsLockedFromRandom = false;
    setupPhase = PHASE_PICKING;
    setDerivedTeamCount(null);
    if (teamsList) teamsList.innerHTML = "";
    renderPlayerPicker();
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function beginManualAssign() {
    if (teamCount === null) return;
    teamsLockedFromRandom = false;
    setupPhase = PHASE_TEAMS;
    resizeAssignments(teamCount);
    renderTeams({ fromMemory: true });
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function beginRandomizeAssign() {
    if (teamCount === null) return;
    const ids = [...tournamentPlayerIds];
    if (ids.length !== teamCount * 2) return;
    randomizeTeamAssignments(ids);
    teamsLockedFromRandom = true;
    setupPhase = PHASE_TEAMS;
    renderTeams({ fromMemory: true });
    syncPhaseUI();
    syncSetupStatus();
    syncDirtyUI();
  }

  function syncAssignmentsFromUi() {
    if (!teamsLockedFromRandom) {
      readAssignmentsFromDom();
    }
  }

  function readAssignmentsFromDom() {
    if (!teamsList || teamsLockedFromRandom) return;
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

  function renderTeams(options = {}) {
    if (!teamsList) return;

    if (!options.fromMemory && !teamsLockedFromRandom) {
      readAssignmentsFromDom();
    }

    if (setupPhase !== PHASE_TEAMS || teamCount === null) {
      if (setupPhase !== PHASE_TEAMS) {
        teamsList.innerHTML = "";
      }
      syncDirtyUI();
      return;
    }

    teamsHint?.classList.add("hidden");
    resizeAssignments(teamCount);

    const taken = assignedPlayerIds();
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
        label.textContent = `Player ${slotIndex + 1}`;

        const selectedId = slot === "player1" ? assignment.player1Id : assignment.player2Id;

        if (teamsLockedFromRandom) {
          const nameEl = document.createElement("p");
          nameEl.className = "gt-input gt-input-compact flex items-center";
          nameEl.textContent = playerNameById(selectedId) || "—";
          field.append(label, nameEl);
          grid.appendChild(field);
          return;
        }

        label.htmlFor = `team-${i + 1}-${slot}`;

        const select = document.createElement("select");
        select.id = `team-${i + 1}-${slot}`;
        select.name = `gtCornholeTeam${i + 1}${slot}`;
        select.className = "gt-input gt-input-compact";
        select.setAttribute("data-slot", slot);

        fillPlayerSelect(select, selectedId, taken);

        select.addEventListener("change", () => {
          const chosen = String(select.value || "");
          const prior =
            slot === "player1" ? assignment.player1Id : assignment.player2Id;

          function applyChange() {
            readAssignmentsFromDom();
            renderTeams();
            syncSetupStatus();
            syncDirtyUI();
          }

          if (!chosen || chosen === prior) {
            applyChange();
            return;
          }

          const existing = findPlayerAssignment(chosen);
          if (
            !existing ||
            (existing.teamIndex === i && existing.slot === slot)
          ) {
            applyChange();
            return;
          }

          select.value = prior || "";
          select.classList.toggle("gt-select-empty", !select.value);
          const name = playerNameById(chosen) || "That player";
          GameTracker.confirmModal({
            message: `${name} is already assigned to Team ${existing.teamIndex + 1}.`,
            confirmLabel: "Move Player",
            cancelLabel: "Return",
            onConfirm: () => {
              const from = teamAssignments[existing.teamIndex];
              if (from) {
                if (from.player1Id === chosen) from.player1Id = "";
                if (from.player2Id === chosen) from.player2Id = "";
              }
              const dest = teamAssignments[i];
              if (dest) {
                if (slot === "player1") dest.player1Id = chosen;
                else dest.player2Id = chosen;
              }
              renderTeams({ fromMemory: true });
              syncSetupStatus();
              syncDirtyUI();
            },
            onCancel: () => {
              select.value = prior || "";
              select.classList.toggle("gt-select-empty", !select.value);
            },
          });
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
    syncAssignmentsFromUi();
    if (teamCount !== null) {
      resizeAssignments(teamCount);
    }
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
    teamCount = parseTeamCount();

    if (typeError) {
      typeError.classList.toggle("hidden", !!selectedType);
    }

    if (teamCountError) {
      const poolCheck = validateTournamentPlayerPool();
      const showTeamError =
        setupPhase !== PHASE_PICKING && teamCount === null && tournamentPlayerIds.size > 0;
      teamCountError.classList.toggle("hidden", !showTeamError || poolCheck.ok);
    }

    if (nameError) {
      syncNameError();
    }

    syncDirtyUI();
    syncSetupStatus();
  }

  /**
   * @param {CornholeTournament} tournament
   */
  function applyTournament(tournament) {
    suppressDirty = true;
    reservedName = null;
    fromPrepopulated = false;
    existingTournamentSource = null;
    keepExistingPlayersUsed = false;
    teamsLockedFromRandom = false;
    editingId = tournament.id || null;
    savedMatches = Array.isArray(tournament.matches) ? tournament.matches : [];
    savedStatus = tournament.status || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;

    if (nameInput) {
      nameInput.value = tournament.name || "";
    }

    typeInputs.forEach((input) => {
      input.checked = input.value === tournament.type;
    });

    const teams = Array.isArray(tournament.teams) ? tournament.teams : [];
    teamAssignments = teams.map((team) => ({
      id: team.id,
      player1Id: team.player1Id || "",
      player2Id: team.player2Id || "",
    }));
    savedTeams = teams.map((team) => ({ ...team }));
    if (Array.isArray(tournament.playerPoolIds) && tournament.playerPoolIds.length > 0) {
      tournamentPlayerIds = new Set(
        tournament.playerPoolIds.map((id) => String(id || "")).filter(Boolean)
      );
      mergePoolFromTeams(teamAssignments);
    } else {
      syncPoolFromTeams(teamAssignments);
    }

    const hasAssignedPlayers = teamAssignments.some(
      (t) => t.player1Id || t.player2Id
    );
    selectedType = currentType();

    // Only show the Teams step after players were placed (assign/randomize).
    if (hasAssignedPlayers) {
      setDerivedTeamCount(
        Math.max(teamAssignments.length, Math.ceil(tournamentPlayerIds.size / 2), MIN_TEAMS)
      );
      setupPhase = PHASE_TEAMS;
    } else if (tournamentPlayerIds.size > 0) {
      const poolCheck = validateTournamentPlayerPool();
      if (poolCheck.ok) {
        setDerivedTeamCount(poolCheck.teamCount);
        teamAssignments = [];
        resizeAssignments(poolCheck.teamCount);
        setupPhase = PHASE_CHOOSE;
      } else {
        setDerivedTeamCount(null);
        teamAssignments = [];
        setupPhase = PHASE_PICKING;
      }
    } else if (teams.length >= MIN_TEAMS) {
      setDerivedTeamCount(teams.length);
      teamAssignments = teams.map((team) => ({
        id: team.id,
        player1Id: team.player1Id || "",
        player2Id: team.player2Id || "",
      }));
      resizeAssignments(teams.length);
      setupPhase = PHASE_CHOOSE;
    } else {
      setDerivedTeamCount(null);
      teamAssignments = [];
      setupPhase = PHASE_SETUP;
    }

    teamCount = parseTeamCount();
    renderPlayerPicker();
    renderTeams({ fromMemory: true });
    syncPhaseUI();
    syncSetupStatus();
    suppressDirty = false;
    markBaseline();
    syncNameError();
    syncPrepopulatedButtons();
  }

  /**
   * Remember a completed tournament for Keep-all-players / last results only.
   * Step 1 stays blank until the user enters name and elimination type.
   * @param {CornholeTournament} tournament
   */
  function applyPrepopulatedFrom(tournament) {
    startFreshSetup({ previousTournament: tournament });
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
    syncAssignmentsFromUi();
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
    if (teamCount === null || setupPhase === PHASE_PICKING || setupPhase === PHASE_SETUP) {
      teamCountError?.classList.remove("hidden");
      setPlayerPickerError(
        setupPhase === PHASE_SETUP
          ? "Complete name and elimination type, then select players."
          : setupPhase === PHASE_PICKING
            ? "Select players and tap Done first."
            : "Select an even number of players for 2–20 teams."
      );
      ok = false;
    } else {
      teamCountError?.classList.add("hidden");
    }
    return ok;
  }

  /**
   * @param {{ quiet?: boolean }} [options]
   * @returns {Promise<CornholeTournament|null>}
   */
  async function saveTournament(options = {}) {
    const quiet = !!options.quiet;
    if (!validateForSave()) {
      if (!quiet) {
        if (isReservedName(currentName())) {
          setSaveStatus("Change the tournament name before saving.", true);
        } else {
          setSaveStatus("Fix the highlighted setup fields, then try again.", true);
        }
      } else {
        setStartError("Fix the highlighted setup fields, then try again.");
      }
      return null;
    }

    const teamsPayload = buildTeamsPayload();
    const payload = {
      name: currentName(),
      type: selectedType,
      teams: teamsPayload,
      matches: savedMatches,
      status: savedStatus || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP,
      playerPoolIds: [...tournamentPlayerIds],
    };
    if (editingId) {
      payload.id = editingId;
    }

    if (startBtn) startBtn.disabled = true;
    if (!quiet) setSaveStatus("Saving tournament…");
    else setSaveStatus("Saving…");

    try {
      const saved = await GameTracker.Cornhole.saveTournament(payload);
      suppressDirty = true;
      reservedName = null;
      fromPrepopulated = false;
      editingId = saved.id;
      savedMatches = Array.isArray(saved.matches) ? saved.matches : [];
      savedStatus = saved.status || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
      if (Array.isArray(saved.teams)) {
        const fromSaved = saved.teams.map((team) => ({
          id: team.id,
          player1Id: team.player1Id || "",
          player2Id: team.player2Id || "",
        }));
        const sentFilled = teamsPayload.filter((t) => t.player1Id && t.player2Id).length;
        const savedFilled = fromSaved.filter((t) => t.player1Id && t.player2Id).length;
        if (teamsLockedFromRandom && sentFilled > savedFilled) {
          teamAssignments = teamsPayload.map((team, index) => ({
            id: fromSaved[index]?.id || team.id,
            player1Id: team.player1Id || "",
            player2Id: team.player2Id || "",
          }));
        } else {
          teamAssignments = fromSaved;
        }
        savedTeams = saved.teams.map((team) => ({ ...team }));
        if (Array.isArray(saved.playerPoolIds) && saved.playerPoolIds.length > 0) {
          tournamentPlayerIds = new Set(
            saved.playerPoolIds.map((id) => String(id || "")).filter(Boolean)
          );
          mergePoolFromTeams(teamAssignments);
        }
        if (setupPhase === PHASE_PICKING || setupPhase === PHASE_CHOOSE) {
          setupPhase = PHASE_TEAMS;
        }
        renderPlayerPicker();
        renderTeams({ fromMemory: true });
        syncPhaseUI();
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
      if (!quiet) {
        setSaveStatus("Cornhole tournament saved. You can leave and update it later.");
      } else {
        setSaveStatus("");
      }
      return saved;
    } catch (err) {
      const message = err.message || "Could not save tournament.";
      if (!quiet) {
        setSaveStatus(message, true);
      } else {
        setStartError(message);
        setSaveStatus("");
      }
      return null;
    } finally {
      if (startBtn) startBtn.disabled = false;
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
  if (nameInput) {
    nameInput.addEventListener("input", syncSetup);
  }
  if (lastResultsBtn) {
    lastResultsBtn.addEventListener("click", () => {
      openLastResults();
    });
  }
  if (keepExistingPlayersBtn) {
    keepExistingPlayersBtn.addEventListener("click", () => {
      keepAllPlayersFromExisting();
    });
  }
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      startTournament();
    });
  }
  if (setupNextBtn) {
    setupNextBtn.addEventListener("click", () => {
      goToPlayerStep();
    });
  }
  if (setupBackBtn) {
    setupBackBtn.addEventListener("click", () => {
      goBackToSetup();
    });
  }
  if (setupBackBtn2) {
    setupBackBtn2.addEventListener("click", () => {
      goBackToPicking();
    });
  }
  if (setupBackBtn3) {
    setupBackBtn3.addEventListener("click", () => {
      goBackToChoose();
    });
  }
  if (donePlayersBtn) {
    donePlayersBtn.addEventListener("click", () => {
      confirmAllPlayersSelected();
    });
  }
  if (changePlayersBtn) {
    changePlayersBtn.addEventListener("click", () => {
      changeSelectedPlayers();
    });
  }
  if (assignTeamsBtn) {
    assignTeamsBtn.addEventListener("click", () => {
      beginManualAssign();
    });
  }
  if (randomizeTeamsBtn) {
    randomizeTeamsBtn.addEventListener("click", () => {
      beginRandomizeAssign();
    });
  }
  if (addMoreTeamsBtn) {
    addMoreTeamsBtn.addEventListener("click", () => {
      goToAddMoreTeams();
    });
  }

  async function load() {
    try {
      players = await GameTracker.Cornhole.fetchPlayers();
      if (players.length === 0) {
        setStatus("");
        playersEmpty?.classList.remove("hidden");
        if (playerPickerList) playerPickerList.innerHTML = "";
        if (playerSelectedList) playerSelectedList.innerHTML = "";
        if (teamsList) teamsList.innerHTML = "";
      } else {
        playersEmpty?.classList.add("hidden");
        setStatus(
          `${players.length} player${players.length === 1 ? "" : "s"} available.`
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

      let resumedSetup = false;
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
          resumedSetup = true;
          if (!params.get("id")) {
            params.set("id", tournament.id);
            window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          }
          if (!formDraft) {
            setSaveStatus("Loaded saved Cornhole tournament.");
          }
        } else if (
          tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED
        ) {
          // New tournament after a completed one: leave Step 1 blank.
          startFreshSetup({ previousTournament: tournament });
          clearSetupUrlId();
        } else {
          startFreshSetup();
        }
      } else if (!formDraft || !isMidWizardFormDraft(formDraft)) {
        const draft = pickDraftTournament(tournaments);
        if (draft) {
          applyTournament(draft);
          resumedSetup = true;
          params.set("id", draft.id);
          window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          setSaveStatus("Loaded your in-progress Cornhole tournament.");
        } else {
          const previous = pickLatestCompleted(tournaments);
          startFreshSetup(
            previous ? { previousTournament: previous } : undefined
          );
        }
      } else {
        startFreshSetup();
      }

      // Restore session draft only when returning mid-wizard (Add Player /
      // last results). Stale Step 1 drafts must not re-fill name/type.
      if (formDraft && isMidWizardFormDraft(formDraft)) {
        restoreFormDraft(formDraft);
      } else {
        clearFormDraft();
        if (!resumedSetup) {
          clearStep1Fields();
          syncPrepopulatedButtons();
        }
        renderPlayerPicker();
        syncPhaseUI();
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
  syncPhaseUI();
  if (addPlayerLink) {
    updateAddPlayerLink();
    addPlayerLink.addEventListener("click", () => {
      saveFormDraft();
    });
  }
  load();
})();
