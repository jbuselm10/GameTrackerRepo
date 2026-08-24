(() => {
  const pageStatus = document.getElementById("page-status");
  const saveStatus = document.getElementById("save-status");
  const activePanel = document.getElementById("active-panel");
  const tournamentNameEl = document.getElementById("tournament-name");
  const tournamentTypeEl = document.getElementById("tournament-type");
  const backToSetupBtn = document.getElementById("back-to-setup-btn");
  const endTournamentBtn = document.getElementById("end-tournament-btn");
  const liveStatusEl = document.getElementById("tournament-live-status");
  const championBanner = document.getElementById("champion-banner");
  const standingsBanner = document.getElementById("standings-banner");
  const reminder = document.getElementById("main-tournament-reminder");
  const winnersBracket = document.getElementById("winners-bracket");
  const losersSection = document.getElementById("losers-section");
  const losersBracket = document.getElementById("losers-bracket");
  const finalsSection = document.getElementById("finals-section");
  const grandFinalBracket = document.getElementById("grand-final-bracket");
  const grandFinalRow = document.getElementById("grand-final-row");
  const resetNote = document.getElementById("reset-note");
  const resetBracket = document.getElementById("reset-bracket");
  const thirdPlaceSection = document.getElementById("third-place-section");
  const thirdPlaceBracket = document.getElementById("third-place-bracket");

  const SIDES = GameTracker.Cornhole.BRACKET_SIDES;
  const STATUSES = GameTracker.Cornhole.MATCH_STATUSES;
  const TYPES = GameTracker.Cornhole.TOURNAMENT_TYPES;
  const escapeHtml = GameTracker.escapeHtml.bind(GameTracker);

  /** @type {CornholeTournament | null} */
  let tournament = null;
  let saving = false;
  let viewingLastResults = false;
  let editingResults = false;

  function setPageStatus(message, isError = false) {
    if (!pageStatus) return;
    pageStatus.textContent = message || "";
    pageStatus.classList.toggle("hidden", !message);
    pageStatus.classList.remove("gt-status-err", "gt-status-ok");
    if (message && isError) pageStatus.classList.add("gt-status-err");
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

  function typeLabel(type) {
    if (type === TYPES.SINGLE_ELIMINATION) return "Single elimination";
    if (type === TYPES.DOUBLE_ELIMINATION) return "Double elimination";
    return type || "";
  }

  function hasAnyResults() {
    return (tournament?.matches || []).some(
      (m) => m.status === STATUSES.COMPLETED && m.active !== false
    );
  }

  function syncBackToSetupButton() {
    const show =
      !viewingLastResults &&
      !!tournament &&
      tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE &&
      !hasAnyResults();
    backToSetupBtn?.classList.toggle("hidden", !show);
  }

  function syncEndTournamentButton() {
    const show =
      !viewingLastResults &&
      !!tournament &&
      tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE;
    endTournamentBtn?.classList.toggle("hidden", !show);
  }

  function storeLastResults(tournamentData) {
    if (!tournamentData) return;
    try {
      sessionStorage.setItem(
        "gametracker.cornholeLastResults",
        JSON.stringify(tournamentData)
      );
    } catch {
      // Ignore storage failures.
    }
  }

  async function endTournamentNow() {
    if (!tournament || viewingLastResults || saving) return;
    if (tournament.status !== GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE) return;

    GameTracker.confirmModal({
      message: "End this Cornhole tournament now? You can start a new one from the setup page.",
      confirmLabel: "End Tournament Now",
      cancelLabel: "Cancel",
      onConfirm: async () => {
        saving = true;
        if (endTournamentBtn) endTournamentBtn.disabled = true;
        setSaveStatus("Ending tournament…");
        try {
          const saved = await GameTracker.Cornhole.saveTournament({
            id: tournament.id,
            name: tournament.name,
            type: tournament.type,
            teams: tournament.teams,
            matches: tournament.matches || [],
            status: GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED,
          });
          storeLastResults(saved);
          window.location.href = "cornhole-tournament.html";
        } catch (err) {
          setSaveStatus(err.message || "Could not end tournament.", true);
          if (endTournamentBtn) endTournamentBtn.disabled = false;
          saving = false;
        }
      },
    });
  }

  async function goBackToSetup() {
    if (!tournament || viewingLastResults || saving || hasAnyResults()) return;
    saving = true;
    if (backToSetupBtn) backToSetupBtn.disabled = true;
    setSaveStatus("Returning to setup…");
    try {
      await GameTracker.Cornhole.saveTournament({
        id: tournament.id,
        name: tournament.name,
        type: tournament.type,
        teams: tournament.teams,
        matches: [],
        status: GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP,
      });
      window.location.href = `cornhole-tournament.html?id=${encodeURIComponent(tournament.id)}`;
    } catch (err) {
      setSaveStatus(err.message || "Could not return to setup.", true);
      if (backToSetupBtn) backToSetupBtn.disabled = false;
      saving = false;
    }
  }

  function teamById(teamId) {
    if (!tournament || !teamId) return null;
    return (tournament.teams || []).find((t) => t.id === teamId) || null;
  }

  function teamLabel(teamId) {
    const team = teamById(teamId);
    if (!team) return "TBD";
    const players = [team.player1Name, team.player2Name].filter(Boolean).join(" & ");
    return players ? `${team.name}: ${players}` : team.name;
  }

  function waitingLabel(match, slot) {
    const feeders = (tournament.matches || []).filter((m) => {
      if (slot === "team1Id") {
        return (
          (m.nextMatchId === match.id && m.nextSlot === "team1Id") ||
          (m.loserNextMatchId === match.id && m.loserNextSlot === "team1Id") ||
          (m.thirdPlaceMatchId === match.id && m.thirdPlaceSlot === "team1Id")
        );
      }
      if (slot === "team2Id") {
        return (
          (m.nextMatchId === match.id && m.nextSlot === "team2Id") ||
          (m.loserNextMatchId === match.id && m.loserNextSlot === "team2Id") ||
          (m.thirdPlaceMatchId === match.id && m.thirdPlaceSlot === "team2Id")
        );
      }
      return (
        m.nextMatchId === match.id ||
        m.loserNextMatchId === match.id ||
        m.thirdPlaceMatchId === match.id
      );
    });
    const feeder =
      feeders.find((m) =>
        slot === "team1Id"
          ? m.nextSlot === "team1Id" ||
            m.loserNextSlot === "team1Id" ||
            m.thirdPlaceSlot === "team1Id"
          : m.nextSlot === "team2Id" ||
            m.loserNextSlot === "team2Id" ||
            m.thirdPlaceSlot === "team2Id"
      ) || feeders[0];
    if (feeder) {
      const viaThird = feeder.thirdPlaceMatchId === match.id;
      const viaLoser = feeder.loserNextMatchId === match.id;
      if (viaThird || (viaLoser && match.bracket === SIDES.THIRD_PLACE)) {
        return `Waiting for loser of Match ${feeder.matchNumber} (R${feeder.round})`;
      }
      return viaLoser
        ? `Waiting for loser of Match ${feeder.matchNumber} (R${feeder.round})`
        : `Waiting for winner of Match ${feeder.matchNumber} (R${feeder.round})`;
    }
    if (match.bracket === SIDES.LOSERS) {
      if (match.round <= 1) return "Waiting for winners-bracket loser…";
      return "Waiting for previous round winner…";
    }
    if (match.bracket === SIDES.GRAND_FINAL) {
      if (slot === "team1Id") return "Waiting for winners-bracket champion…";
      return "Waiting for losers-bracket champion…";
    }
    return "Waiting…";
  }

  function feedsThirdPlace(match) {
    if (!tournament || !match) return false;
    if (match.thirdPlaceMatchId) return true;
    if (!match.loserNextMatchId) return false;
    const dest = (tournament.matches || []).find((m) => m.id === match.loserNextMatchId);
    return !!(dest && dest.bracket === SIDES.THIRD_PLACE);
  }

  function loserOutcomeLabel(match, teamId) {
    if (!tournament || !teamId || match.loserId !== teamId) return "";
    if (match.bracket === SIDES.THIRD_PLACE) return "4th place";
    if (feedsThirdPlace(match) && tournament.type === TYPES.SINGLE_ELIMINATION) {
      return "To third place";
    }
    if (tournament.type === TYPES.SINGLE_ELIMINATION) return "Eliminated";
    if (match.bracket === SIDES.LOSERS) return "Eliminated";
    if (match.bracket === SIDES.GRAND_FINAL) {
      // LB team winning Game 1 does not eliminate the WR team — Game 2 is required.
      const lbSide =
        match.team2Id && match.winnerId === match.team2Id
          ? match.team2Id
          : null;
      if (lbSide && match.loserId === teamId) return "To Game 2";
      return "Eliminated";
    }
    if (match.bracket === SIDES.GRAND_FINAL_RESET) return "Eliminated";
    if (match.loserNextMatchId) return "To losers bracket";
    return GameTracker.Cornhole.isEliminated(tournament.matches, teamId, tournament.type)
      ? "Eliminated"
      : "To losers bracket";
  }

  function canEditMatch(match) {
    if (viewingLastResults) return false;
    if (!tournament || !match || match.active === false) return false;
    if (tournament.status !== GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED) {
      return true;
    }
    if (editingResults) return true;
    // After the championship, only the optional third-place game stays editable
    // until Change results is selected.
    return match.bracket === SIDES.THIRD_PLACE;
  }

  function canShowChangeResult(match) {
    if (viewingLastResults) return false;
    if (!tournament || !match || match.active === false) return false;
    if (match.losersBye) return false;
    return true;
  }

  function toggleEditingResults() {
    editingResults = !editingResults;
    renderBracket();
  }

  function renderTeamRow(match, slot) {
    const teamId = match[slot];
    const row = document.createElement("div");
    row.className = "gt-bracket-team";

    if (!teamId) {
      row.classList.add("gt-bracket-team-waiting");
      row.textContent = waitingLabel(match, slot);
      return row;
    }

    const label = document.createElement("div");
    label.className = "gt-bracket-team-label";
    let name = teamLabel(teamId);
    if (match.bracket === SIDES.GRAND_FINAL || match.bracket === SIDES.GRAND_FINAL_RESET) {
      name =
        slot === "team1Id"
          ? `${name} (Winners bracket)`
          : `${name} (Losers bracket)`;
    }
    label.textContent = name;

    const actions = document.createElement("div");
    actions.className = "gt-bracket-team-actions";

    if (match.status === STATUSES.COMPLETED && match.winnerId === teamId) {
      row.classList.add("gt-bracket-team-winner");
      const badge = document.createElement("span");
      badge.className = "gt-bracket-badge";
      const dest = match.nextMatchId
        ? (tournament.matches || []).find((m) => m.id === match.nextMatchId)
        : null;
      badge.textContent =
        dest && dest.bracket === SIDES.LOSERS && dest.round > match.round
          ? `Winner · to Round ${dest.round}`
          : dest &&
              (dest.bracket === SIDES.GRAND_FINAL ||
                dest.bracket === SIDES.GRAND_FINAL_RESET)
            ? "Winner · to Championship"
            : "Winner";
      actions.appendChild(badge);
    } else if (match.status === STATUSES.COMPLETED && match.loserId === teamId) {
      row.classList.add("gt-bracket-team-out");
      const badge = document.createElement("span");
      badge.className = "gt-bracket-badge-out";
      badge.textContent = loserOutcomeLabel(match, teamId);
      actions.appendChild(badge);
    } else if (
      canEditMatch(match) &&
      match.team1Id &&
      match.team2Id &&
      match.status !== STATUSES.COMPLETED
    ) {
      const winBtn = document.createElement("button");
      winBtn.type = "button";
      winBtn.className = "gt-btn text-xs";
      winBtn.textContent = "Won";
      winBtn.addEventListener("click", () => pickWinner(match.id, teamId));
      actions.appendChild(winBtn);
    }

    row.append(label, actions);
    return row;
  }

  function renderMatchCard(match) {
    const card = document.createElement("div");
    card.className = "gt-bracket-match";
    if (match.active === false) card.classList.add("hidden");

    const titleRow = document.createElement("div");
    titleRow.className = "gt-bracket-match-heading";

    const title = document.createElement("div");
    title.className = "gt-bracket-match-title";
    let sideLabel = "Match";
    if (match.bracket === SIDES.GRAND_FINAL) sideLabel = "Championship";
    if (match.bracket === SIDES.GRAND_FINAL_RESET) sideLabel = "Championship";
    if (match.bracket === SIDES.THIRD_PLACE) sideLabel = "Third place";
    title.textContent =
      match.bracket === SIDES.THIRD_PLACE
        ? "Third place match"
        : match.bracket === SIDES.GRAND_FINAL
          ? "Championship — Game 1"
          : match.bracket === SIDES.GRAND_FINAL_RESET
            ? "Game 2"
            : `${sideLabel} ${match.matchNumber} · Round ${match.round}`;
    titleRow.appendChild(title);

    if (match.byeToNextRound) {
      const byeNote = document.createElement("span");
      byeNote.className = "gt-bracket-bye-note";
      byeNote.textContent = "This match was selected for next round bye";
      titleRow.appendChild(byeNote);
    }
    card.appendChild(titleRow);

    card.appendChild(renderTeamRow(match, "team1Id"));
    if (!(match.losersBye && !match.team2Id)) {
      card.appendChild(renderTeamRow(match, "team2Id"));
    }

    if (match.status === STATUSES.COMPLETED && canShowChangeResult(match)) {
      const changeBtn = document.createElement("button");
      changeBtn.type = "button";
      changeBtn.className = "gt-btn-secondary text-xs mt-2";
      changeBtn.textContent = "Change result";
      changeBtn.addEventListener("click", () => clearMatch(match.id));
      card.appendChild(changeBtn);
    }

    return card;
  }

  function appendChampionCallout(container) {
    if (!container || !tournament) return;
    container.querySelectorAll(".gt-champion-callout").forEach((el) => el.remove());
    const champion = GameTracker.Cornhole.championId(tournament.matches || []);
    if (!champion) return;
    const el = document.createElement("p");
    el.className = "gt-champion-callout";
    el.textContent = `${teamLabel(champion)} ARE THE CHAMPIONS !!`;
    container.appendChild(el);
  }

  function renderRounds(container, matches, options = {}) {
    if (!container) return;
    const hideRoundTitles = !!options.hideRoundTitles;
    container.innerHTML = "";
    const byRound = new Map();
    matches.forEach((m) => {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round).push(m);
    });
    const rounds = [...byRound.keys()].sort((a, b) => a - b);
    rounds.forEach((round) => {
      const col = document.createElement("div");
      col.className = "gt-bracket-round";
      const roundMatches = byRound
        .get(round)
        .slice()
        .sort((a, b) => a.matchNumber - b.matchNumber);
      if (!hideRoundTitles) {
        const heading = document.createElement("h4");
        heading.className = "gt-bracket-round-title";
        const byeTeamId = roundMatches.find((m) => m.roundByeTeamId)?.roundByeTeamId;
        const seFinal =
          tournament?.type === TYPES.SINGLE_ELIMINATION &&
          roundMatches.some(
            (m) =>
              m.bracket === SIDES.WINNERS &&
              !m.nextMatchId &&
              m.status === STATUSES.COMPLETED &&
              m.winnerId
          );
        if (seFinal) {
          heading.textContent = "Championship";
        } else if (byeTeamId) {
          heading.textContent = `Round ${round} (${teamLabel(byeTeamId)} bye to next round)`;
        } else {
          heading.textContent = `Round ${round}`;
        }
        col.appendChild(heading);
      }
      roundMatches.forEach((match) => col.appendChild(renderMatchCard(match)));
      container.appendChild(col);
    });
  }

  function renderHeader() {
    if (!tournament) return;
    if (tournamentNameEl) tournamentNameEl.textContent = tournament.name || "Cornhole Tournament";
    if (tournamentTypeEl) tournamentTypeEl.textContent = typeLabel(tournament.type);
    syncBackToSetupButton();
    syncEndTournamentButton();

    const champion = GameTracker.Cornhole.championId(tournament.matches || []);
    if (liveStatusEl) {
      if (tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED || champion) {
        liveStatusEl.textContent = "Tournament completed";
      } else {
        liveStatusEl.textContent = "Tournament in progress";
      }
    }

    if (championBanner) {
      if (champion) {
        championBanner.classList.remove("hidden");
        championBanner.innerHTML = `<strong>Champion:</strong> ${escapeHtml(teamLabel(champion))}`;
        reminder?.classList.remove("hidden");
      } else {
        championBanner.classList.add("hidden");
        championBanner.textContent = "";
        reminder?.classList.add("hidden");
      }
    }

    if (standingsBanner) {
      if (champion && !viewingLastResults) {
        const standings = GameTracker.Cornhole.topThree(tournament.matches || []);
        const thirdText = standings.third ? escapeHtml(teamLabel(standings.third)) : "";
        standingsBanner.classList.remove("hidden");
        standingsBanner.innerHTML = `
          <div class="gt-standings-row">
            <div>
              <strong>Top 3</strong>
              <ol>
                <li><strong>1st</strong> — ${escapeHtml(teamLabel(standings.first))}</li>
                <li><strong>2nd</strong> — ${
                  standings.second ? escapeHtml(teamLabel(standings.second)) : ""
                }</li>
                <li><strong>3rd</strong> — ${thirdText}</li>
              </ol>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <button type="button" id="change-results-btn" class="gt-btn-secondary text-sm whitespace-nowrap">
                ${editingResults ? "Done" : "Change results"}
              </button>
              <a href="index.html" class="gt-btn text-sm whitespace-nowrap">Home</a>
            </div>
          </div>
        `;
        document.getElementById("change-results-btn")?.addEventListener("click", () => {
          toggleEditingResults();
        });
      } else if (champion && viewingLastResults) {
        const standings = GameTracker.Cornhole.topThree(tournament.matches || []);
        const thirdText = standings.third ? escapeHtml(teamLabel(standings.third)) : "";
        standingsBanner.classList.remove("hidden");
        standingsBanner.innerHTML = `
          <strong>Top 3</strong>
          <ol>
            <li><strong>1st</strong> — ${escapeHtml(teamLabel(standings.first))}</li>
            <li><strong>2nd</strong> — ${
              standings.second ? escapeHtml(teamLabel(standings.second)) : ""
            }</li>
            <li><strong>3rd</strong> — ${thirdText}</li>
          </ol>
        `;
      } else {
        standingsBanner.classList.add("hidden");
        standingsBanner.innerHTML = "";
      }
    }
  }

  function renderBracket() {
    if (!tournament) return;
    const matches = tournament.matches || [];
    const winners = matches.filter((m) => m.bracket === SIDES.WINNERS);
    const losers = matches.filter((m) => m.bracket === SIDES.LOSERS);
    const gf = matches.filter((m) => m.bracket === SIDES.GRAND_FINAL);
    const reset = matches.filter((m) => m.bracket === SIDES.GRAND_FINAL_RESET && m.active);
    const thirdPlace = matches.filter((m) => m.bracket === SIDES.THIRD_PLACE);

    renderRounds(winnersBracket, winners);
    if (tournament.type !== TYPES.DOUBLE_ELIMINATION) {
      appendChampionCallout(winnersBracket);
    }

    if (tournament.type === TYPES.DOUBLE_ELIMINATION) {
      losersSection?.classList.remove("hidden");
      finalsSection?.classList.remove("hidden");
      renderRounds(losersBracket, losers);
      renderRounds(grandFinalBracket, gf, { hideRoundTitles: true });
      if (reset.length > 0) {
        renderRounds(resetBracket, reset, { hideRoundTitles: true });
      } else {
        if (resetBracket) resetBracket.innerHTML = "";
      }
      appendChampionCallout(grandFinalRow);
      resetNote?.classList.add("hidden");
    } else {
      losersSection?.classList.add("hidden");
      finalsSection?.classList.add("hidden");
    }

    if (thirdPlace.length > 0) {
      thirdPlaceSection?.classList.remove("hidden");
      renderRounds(thirdPlaceBracket, thirdPlace);
    } else {
      thirdPlaceSection?.classList.add("hidden");
      if (thirdPlaceBracket) thirdPlaceBracket.innerHTML = "";
    }

    renderHeader();
  }

  async function persist(nextMatches) {
    if (!tournament || saving || viewingLastResults) return;
    saving = true;
    setSaveStatus("Saving…");
    try {
      const champion = GameTracker.Cornhole.championId(nextMatches);
      const status = champion
        ? GameTracker.Cornhole.TOURNAMENT_STATUSES.COMPLETED
        : GameTracker.Cornhole.TOURNAMENT_STATUSES.ACTIVE;
      const saved = await GameTracker.Cornhole.saveTournament({
        id: tournament.id,
        name: tournament.name,
        type: tournament.type,
        teams: tournament.teams,
        matches: nextMatches,
        status,
      });
      tournament = saved;
      renderBracket();
      setSaveStatus(champion ? "Champion decided. Results saved." : "Result saved.");
    } catch (err) {
      setSaveStatus(err.message || "Could not save result.", true);
    } finally {
      saving = false;
    }
  }

  async function pickWinner(matchId, winnerId) {
    if (!tournament || saving) return;
    try {
      const nextMatches = GameTracker.Cornhole.applyResult(
        tournament.matches || [],
        matchId,
        winnerId
      );
      await persist(nextMatches);
    } catch (err) {
      setSaveStatus(err.message || "Could not apply result.", true);
    }
  }

  async function clearMatch(matchId) {
    if (!tournament || saving) return;
    try {
      const nextMatches = GameTracker.Cornhole.clearResult(tournament.matches || [], matchId);
      await persist(nextMatches);
    } catch (err) {
      setSaveStatus(err.message || "Could not clear result.", true);
    }
  }

  async function load() {
    const params = new URLSearchParams(window.location.search);
    const lastResults = params.get("lastResults") === "1";
    if (lastResults) {
      try {
        const raw = sessionStorage.getItem("gametracker.cornholeLastResults");
        const snap = raw ? JSON.parse(raw) : null;
        if (!snap || typeof snap !== "object") {
          setPageStatus("No last tournament results are available.", true);
          return;
        }
        tournament = snap;
        viewingLastResults = true;
        activePanel?.classList.remove("hidden");
        setPageStatus("Viewing results of the last Cornhole tournament.");
        renderBracket();
      } catch (err) {
        setPageStatus(err.message || "Could not load last tournament results.", true);
      }
      return;
    }

    const id = params.get("id");
    if (!id) {
      setPageStatus("No tournament selected. Open Cornhole to start one.", true);
      return;
    }
    try {
      tournament = await GameTracker.Cornhole.fetchTournament(id);
      if (tournament.status === GameTracker.Cornhole.TOURNAMENT_STATUSES.SETUP) {
        window.location.href = `cornhole-tournament.html?id=${encodeURIComponent(tournament.id)}`;
        return;
      }
      activePanel?.classList.remove("hidden");
      setPageStatus("");
      renderBracket();
    } catch (err) {
      setPageStatus(err.message || "Could not load Cornhole tournament.", true);
    }
  }

  load();

  if (backToSetupBtn) {
    backToSetupBtn.addEventListener("click", () => {
      goBackToSetup();
    });
  }
  if (endTournamentBtn) {
    endTournamentBtn.addEventListener("click", () => {
      endTournamentNow();
    });
  }
})();
