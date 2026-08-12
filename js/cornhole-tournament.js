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
  const setupStatus = document.getElementById("setup-status");
  const saveStatus = document.getElementById("save-status");
  const saveBtn = document.getElementById("save-tournament-btn");
  const addPlayerLink = document.getElementById("add-player-link");

  const MIN_TEAMS = GameTracker.Cornhole.MIN_TEAMS;
  const MAX_TEAMS = GameTracker.Cornhole.MAX_TEAMS;
  const UNSAVED_MESSAGE = "Changes have NOT been saved.";

  /** @type {CornholePlayer[]} */
  let players = [];
  /** @type {CornholeTournamentType | ""} */
  let selectedType = "";
  /** @type {number | null} */
  let teamCount = null;
  /** @type {{ id?: string, player1Id: string, player2Id: string }[]} */
  let teamAssignments = [];
  /** @type {string | null} */
  let editingId = null;
  /** @type {CornholeMatch[]} */
  let savedMatches = [];
  /** @type {CornholeTournamentStatus} */
  let savedStatus = GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
  /** @type {{ name: string, type: string, teamCount: number | null, teams: { player1Id: string, player2Id: string }[] } | null} */
  let baseline = null;
  let suppressDirty = false;

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
      nameError.classList.toggle("hidden", currentName() !== "");
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

    selectedType = currentType();
    teamCount = parseTeamCount();
    renderTeams();
    syncSetupStatus();
    suppressDirty = false;
    markBaseline();
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
    if (!name) {
      nameError?.classList.remove("hidden");
      ok = false;
    } else {
      nameError?.classList.add("hidden");
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
      setSaveStatus("Fix the highlighted setup fields, then try again.", true);
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
      editingId = saved.id;
      savedMatches = Array.isArray(saved.matches) ? saved.matches : [];
      savedStatus = saved.status || GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP;
      if (Array.isArray(saved.teams)) {
        teamAssignments = saved.teams.map((team) => ({
          id: team.id,
          player1Id: team.player1Id || "",
          player2Id: team.player2Id || "",
        }));
        renderTeams();
      }
      const params = new URLSearchParams(window.location.search);
      params.set("id", saved.id);
      const nextUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", nextUrl);
      if (addPlayerLink) {
        addPlayerLink.href = `players.html?returnTo=${encodeURIComponent(window.location.href)}`;
      }
      syncSetupStatus();
      suppressDirty = false;
      markBaseline();
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
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveTournament();
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
      if (id) {
        const tournament = await GameTracker.Cornhole.fetchTournament(id);
        applyTournament(tournament);
        setSaveStatus("Loaded saved Cornhole tournament.");
      } else {
        const tournaments = await GameTracker.Cornhole.fetchTournaments();
        const draft = pickDraftTournament(tournaments);
        if (draft) {
          applyTournament(draft);
          params.set("id", draft.id);
          window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
          setSaveStatus("Loaded your in-progress Cornhole tournament.");
        } else {
          suppressDirty = true;
          renderTeams();
          syncSetupStatus();
          suppressDirty = false;
          markBaseline();
        }
      }
    } catch (err) {
      setStatus(err.message || "Could not load Cornhole data.", true);
      playersEmpty?.classList.add("hidden");
      teamsHint?.classList.add("hidden");
      if (teamsList) teamsList.innerHTML = "";
    }
  }

  syncSetup();
  if (addPlayerLink) {
    addPlayerLink.href = `players.html?returnTo=${encodeURIComponent(window.location.href)}`;
  }
  load();
})();
