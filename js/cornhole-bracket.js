/**
 * Cornhole bracket engine — pure functions, no DOM.
 */
window.GameTracker = window.GameTracker || {};
window.GameTracker.Cornhole = window.GameTracker.Cornhole || {};

(function () {
  const TYPES = GameTracker.Cornhole.TOURNAMENT_TYPES;
  const STATUSES = GameTracker.Cornhole.MATCH_STATUSES;
  const SIDES = GameTracker.Cornhole.BRACKET_SIDES;

  function newMatchId(counter) {
    return `cmatch_${counter.value++}`;
  }

  /**
   * @param {object} fields
   * @returns {CornholeMatch}
   */
  function makeMatch(fields) {
    return {
      id: fields.id,
      round: fields.round,
      matchNumber: fields.matchNumber,
      bracket: fields.bracket,
      team1Id: fields.team1Id ?? null,
      team2Id: fields.team2Id ?? null,
      winnerId: fields.winnerId ?? null,
      loserId: fields.loserId ?? null,
      nextMatchId: fields.nextMatchId ?? null,
      loserNextMatchId: fields.loserNextMatchId ?? null,
      status: fields.status || STATUSES.PENDING,
      active: fields.active !== false,
      nextSlot: fields.nextSlot || null,
      loserNextSlot: fields.loserNextSlot || null,
      thirdPlaceMatchId: fields.thirdPlaceMatchId ?? null,
      thirdPlaceSlot: fields.thirdPlaceSlot || null,
      losersBye: !!fields.losersBye,
      byeToNextRound: !!fields.byeToNextRound,
      wrLosersPair: !!fields.wrLosersPair,
      wrLosersPairMinRound: fields.wrLosersPairMinRound ?? null,
      roundByeTeamId: fields.roundByeTeamId ?? null,
    };
  }

  function cloneMatches(matches) {
    return matches.map((m) => ({ ...m }));
  }

  function indexById(matches) {
    const map = new Map();
    matches.forEach((m) => map.set(m.id, m));
    return map;
  }

  /**
   * @param {CornholeMatch} match
   * @param {string} teamId
   */
  function placeTeam(match, teamId) {
    if (!teamId) return;
    if (match.team1Id === teamId || match.team2Id === teamId) return;
    if (!match.team1Id) {
      match.team1Id = teamId;
    } else if (!match.team2Id) {
      match.team2Id = teamId;
    }
    if (match.team1Id && match.team2Id && match.status === STATUSES.PENDING) {
      match.status = STATUSES.IN_PROGRESS;
    }
  }

  /**
   * @param {CornholeMatch} match
   * @param {string} teamId
   */
  function removeTeam(match, teamId) {
    if (!teamId) return;
    if (match.team1Id === teamId) match.team1Id = null;
    if (match.team2Id === teamId) match.team2Id = null;
    if (match.winnerId === teamId || match.loserId === teamId) {
      match.winnerId = null;
      match.loserId = null;
    }
    if (!match.team1Id || !match.team2Id) {
      match.status = STATUSES.PENDING;
      match.winnerId = null;
      match.loserId = null;
    } else if (!match.winnerId) {
      match.status = STATUSES.IN_PROGRESS;
    }
  }

  /**
   * @param {Map<string, CornholeMatch>} byId
   * @param {CornholeMatch} fromMatch
   * @param {string} teamId
   * @param {boolean} useLoserPath
   */
  function advanceWithSlot(byId, fromMatch, teamId, useLoserPath) {
    const destId = useLoserPath ? fromMatch.loserNextMatchId : fromMatch.nextMatchId;
    if (!destId || !teamId) return;
    const dest = byId.get(destId);
    if (!dest) return;

    const preferred = useLoserPath ? fromMatch.loserNextSlot : fromMatch.nextSlot;
    if (preferred === "team1Id" || preferred === "team2Id") {
      if (!dest[preferred] || dest[preferred] === teamId) {
        dest[preferred] = teamId;
      } else {
        placeTeam(dest, teamId);
      }
    } else {
      placeTeam(dest, teamId);
    }

    if (dest.team1Id && dest.team2Id) {
      if (dest.status === STATUSES.PENDING) dest.status = STATUSES.IN_PROGRESS;
    } else if (dest.losersBye && (dest.team1Id || dest.team2Id) && !dest.winnerId) {
      const only = dest.team1Id || dest.team2Id;
      dest.winnerId = only;
      dest.loserId = null;
      dest.status = STATUSES.COMPLETED;
      if (dest.nextMatchId) {
        advanceWithSlot(byId, dest, only, false);
      }
    }
  }

  /**
   * @param {{ teamId: string|null, fromMatch: CornholeMatch|null }} entrant
   * @returns {boolean}
   */
  function entrantHadPriorTeamBye(entrant) {
    return !!(entrant.fromMatch && entrant.fromMatch.losersBye);
  }

  /**
   * @param {CornholeMatch|null|undefined} match
   * @param {Set<string>} teamByeRecipients
   * @returns {boolean}
   */
  function matchHasTeamByeRecipient(match, teamByeRecipients) {
    if (!match || match.losersBye) return false;
    return (
      !!(match.team1Id && teamByeRecipients.has(match.team1Id)) ||
      !!(match.team2Id && teamByeRecipients.has(match.team2Id))
    );
  }

  /**
   * Pick a one-team bye entrant: never repeat a prior team bye; from round 3
   * onward prefer entrants fed by the previous round's two-team matches.
   * @param {{ teamId: string|null, fromMatch: CornholeMatch|null }[]} playing
   * @param {number} roundNum
   * @param {Set<string>} teamByeRecipients
   * @returns {{ byeEntrant: { teamId: string|null, fromMatch: CornholeMatch|null }|null, playing: typeof playing }}
   */
  function pickTeamByeEntrant(playing, roundNum, teamByeRecipients) {
    if (playing.length % 2 === 0) {
      return { byeEntrant: null, playing };
    }

    let candidates = playing.filter((e) => {
      if (e.teamId && teamByeRecipients.has(e.teamId)) return false;
      if (entrantHadPriorTeamBye(e)) return false;
      return true;
    });
    if (roundNum >= 3) {
      const prevRoundWinners = candidates.filter(
        (e) =>
          e.fromMatch &&
          e.fromMatch.round === roundNum - 1 &&
          !e.fromMatch.losersBye &&
          !matchHasTeamByeRecipient(e.fromMatch, teamByeRecipients)
      );
      if (prevRoundWinners.length > 0) candidates = prevRoundWinners;
    }
    if (candidates.length === 0) {
      candidates = playing.filter((e) => {
        if (e.teamId && teamByeRecipients.has(e.teamId)) return false;
        if (entrantHadPriorTeamBye(e)) return false;
        return true;
      });
    }
    if (candidates.length === 0) candidates = playing.slice();

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const idx = playing.indexOf(pick);
    const next = playing.slice();
    const byeEntrant = next.splice(idx, 1)[0];
    return { byeEntrant, playing: next };
  }

  /**
   * @param {CornholeMatch[]} matches
   * @param {string} teamId
   * @param {number} beforeRound
   * @returns {boolean}
   */
  function teamHadPriorTeamBye(matches, teamId, beforeRound) {
    return (matches || []).some(
      (m) =>
        m.losersBye &&
        m.active !== false &&
        m.round < beforeRound &&
        (m.team1Id === teamId || m.team2Id === teamId) &&
        (m.bracket === SIDES.LOSERS || m.bracket === SIDES.WINNERS)
    );
  }

  /**
   * @param {CornholeMatch} match
   * @param {number} round
   * @param {CornholeMatch} fromMatch
   * @param {string} teamId
   * @param {CornholeMatch[]} matches
   * @returns {boolean}
   */
  function canFillLosersTeamBye(match, round, fromMatch, teamId, matches) {
    if (!match.losersBye) return true;
    if (teamHadPriorTeamBye(matches, teamId, round)) return false;
    if (round >= 3 && fromMatch.round !== round - 1) return false;
    return true;
  }

  /**
   * Entry-order winners bracket.
   * Odd number of entrants → a randomly chosen entrant gets a one-team bye
   * match and plays in the next round only. When round 1 also has that team
   * bye, one of the real two-team matches is randomly marked to skip the
   * following round. Otherwise an odd count of two-team matches gets one skip.
   * @param {CornholeTeam[]} teams
   * @param {{ value: number }} counter
   */
  function buildWinnersBracket(teams, counter) {
    const matches = [];
    /** @type {CornholeMatch[][]} */
    const allRounds = [];

    /** @type {{ teamId: string|null, fromMatch: CornholeMatch|null }[]} */
    let entrants = teams.map((team) => ({
      teamId: team.id,
      fromMatch: null,
    }));
    let roundNum = 1;
    /** @type {Set<string>} */
    const teamByeRecipients = new Set();

    while (entrants.length > 1) {
      const sources = entrants.slice();
      const roundMatches = [];
      /** @type {{ teamId: string|null, fromMatch: CornholeMatch|null }[]} */
      const advancing = [];
      /** @type {{ teamId: string|null, fromMatch: CornholeMatch|null }|null} */
      let byeEntrant = null;

      const skipThisRound = [];
      const playing = [];
      sources.forEach((entrant) => {
        const feeder = entrant.fromMatch;
        const skipNext =
          feeder &&
          feeder.byeToNextRound &&
          !feeder.losersBye &&
          feeder.round === roundNum - 1;
        if (skipNext) {
          skipThisRound.push(entrant);
        } else {
          playing.push(entrant);
        }
      });

      if (playing.length % 2 === 1) {
        const picked = pickTeamByeEntrant(playing, roundNum, teamByeRecipients);
        byeEntrant = picked.byeEntrant;
        playing.length = 0;
        playing.push(...picked.playing);
      }

      skipThisRound.forEach((entrant) => advancing.push(entrant));

      for (let index = 0; index < playing.length; index += 2) {
        const left = playing[index];
        const right = playing[index + 1];
        const match = makeMatch({
          id: newMatchId(counter),
          round: roundNum,
          matchNumber: roundMatches.length + 1,
          bracket: SIDES.WINNERS,
          team1Id: left.teamId,
          team2Id: right.teamId,
          status:
            left.teamId && right.teamId ? STATUSES.IN_PROGRESS : STATUSES.PENDING,
        });
        if (left.fromMatch) {
          left.fromMatch.nextMatchId = match.id;
          left.fromMatch.nextSlot = "team1Id";
        }
        if (right.fromMatch) {
          right.fromMatch.nextMatchId = match.id;
          right.fromMatch.nextSlot = "team2Id";
        }
        roundMatches.push(match);
        advancing.push({ teamId: null, fromMatch: match });
      }

      if (byeEntrant) {
        if (byeEntrant.teamId) teamByeRecipients.add(byeEntrant.teamId);
        const byeMatch = makeMatch({
          id: newMatchId(counter),
          round: roundNum,
          matchNumber: roundMatches.length + 1,
          bracket: SIDES.WINNERS,
          team1Id: byeEntrant.teamId,
          team2Id: null,
          status: STATUSES.PENDING,
          losersBye: true,
          byeToNextRound: false,
        });
        if (byeEntrant.fromMatch) {
          byeEntrant.fromMatch.nextMatchId = byeMatch.id;
          byeEntrant.fromMatch.nextSlot = "team1Id";
        }
        roundMatches.push(byeMatch);
        advancing.push({ teamId: byeEntrant.teamId, fromMatch: byeMatch });
      }

      const twoTeamMatches = roundMatches.filter((m) => !m.losersBye);
      const needMatchBye = byeEntrant
        ? twoTeamMatches.length > 0
        : twoTeamMatches.length > 1 && twoTeamMatches.length % 2 === 1;
      if (needMatchBye) {
        const skipMatch =
          twoTeamMatches[Math.floor(Math.random() * twoTeamMatches.length)];
        skipMatch.byeToNextRound = true;
      }

      allRounds.push(roundMatches);
      entrants = advancing;
      roundNum += 1;
    }

    allRounds.forEach((roundMatches) => matches.push(...roundMatches));
    const byId = indexById(matches);
    matches.forEach((match) => {
      if (match.losersBye && (match.team1Id || match.team2Id) && !match.winnerId) {
        afterLosersSlotFilled(match, byId);
      }
    });
    const winnersFinalId = allRounds[allRounds.length - 1][0].id;
    return { matches, winnersFinalId, allRounds };
  }

  /**
   * Real (two-team) winners-bracket matches that drop a loser into losers.
   * @param {CornholeMatch[]|undefined} wrRound
   * @returns {number}
   */
  function wrDropInCount(wrRound) {
    return (wrRound || []).filter((m) => !m.losersBye).length;
  }

  /**
   * Build losers-bracket rounds from winners-bracket drop-ins. Each WR round's
   * losers join the LB winners already there, except when the last two WR
   * rounds each have one real loser: those two share one reserved LB match
   * and leftover LB players play down after it. A team that loses in the
   * losers bracket is eliminated. Odd team counts in a round add a one-team
   * bye (play the next round only) and randomly mark one two-team match to
   * skip the following round.
   * @param {CornholeMatch[][]} winnersRounds
   * @param {{ value: number }} counter
   * @returns {{ matches: CornholeMatch[], finalMatch: CornholeMatch|null }}
   */
  function buildLosersBracketFromWinnersRounds(winnersRounds, counter) {
    const matches = [];
    let remaining = 0;
    let roundNum = 1;
    /** @type {CornholeMatch|null} */
    let finalMatch = null;
    /** @type {CornholeMatch|null} */
    let reservedPairMatch = null;
    // byeToNextRound winners skip the next LB round and join the one after.
    // Track them separately so emitRound capacity matches placeInNextLosersRound.
    let skippersArrivingNext = 0;
    let skippersArrivingAfter = 0;

    function absorbDeferredSkippers() {
      remaining += skippersArrivingNext;
      skippersArrivingNext = skippersArrivingAfter;
      skippersArrivingAfter = 0;
    }

    /**
     * @param {number} entrantCount
     * @returns {{ intoNext: number, newSkippers: number }}
     */
    function emitRound(entrantCount) {
      if (entrantCount <= 1) {
        return { intoNext: entrantCount, newSkippers: 0 };
      }

      const created = [];
      let twoTeamEntrants = entrantCount;
      let hadTeamBye = false;

      if (twoTeamEntrants % 2 === 1) {
        hadTeamBye = true;
        const byeMatch = makeMatch({
          id: newMatchId(counter),
          round: roundNum,
          matchNumber: created.length + 1,
          bracket: SIDES.LOSERS,
          team1Id: null,
          team2Id: null,
          status: STATUSES.PENDING,
          losersBye: true,
          byeToNextRound: false,
        });
        matches.push(byeMatch);
        created.push(byeMatch);
        twoTeamEntrants -= 1;
      }

      const matchCount = Math.floor(twoTeamEntrants / 2);
      for (let i = 0; i < matchCount; i += 1) {
        const match = makeMatch({
          id: newMatchId(counter),
          round: roundNum,
          matchNumber: created.length + 1,
          bracket: SIDES.LOSERS,
          team1Id: null,
          team2Id: null,
          status: STATUSES.PENDING,
          losersBye: false,
        });
        matches.push(match);
        created.push(match);
        finalMatch = match;
      }

      const twoTeamMatches = created.filter((m) => !m.losersBye);
      const needMatchBye =
        hadTeamBye
          ? twoTeamMatches.length > 0
          : twoTeamMatches.length > 1 && twoTeamMatches.length % 2 === 1;
      let newSkippers = 0;
      if (needMatchBye) {
        const skipMatch =
          twoTeamMatches[Math.floor(Math.random() * twoTeamMatches.length)];
        skipMatch.byeToNextRound = true;
        newSkippers = 1;
      }

      const advancers = matchCount + (hadTeamBye ? 1 : 0);
      roundNum += 1;
      return { intoNext: advancers - newSkippers, newSkippers };
    }

    /**
     * @param {number} entrantCount
     */
    function emitAndTrack(entrantCount) {
      const result = emitRound(entrantCount);
      remaining = result.intoNext;
      skippersArrivingAfter += result.newSkippers;
    }

    function drainUntilOneOrNone() {
      for (let guard = 0; guard < 64; guard += 1) {
        absorbDeferredSkippers();
        if (remaining > 1) {
          emitAndTrack(remaining);
          continue;
        }
        if (skippersArrivingNext === 0 && skippersArrivingAfter === 0) {
          return;
        }
      }
    }

    const rounds = winnersRounds || [];
    for (let i = 0; i < rounds.length; i += 1) {
      const dropIns = wrDropInCount(rounds[i]);
      const nextDropIns =
        i + 1 < rounds.length ? wrDropInCount(rounds[i + 1]) : 0;
      // Only the last two WR rounds may share a reserved pair (e.g. R3+R4 on
      // 7/10 teams). Mid-bracket singles like R2+R3 on 7 teams must drop in
      // against LB winners instead.
      const isLastSinglePair =
        dropIns === 1 &&
        nextDropIns === 1 &&
        i + 1 === rounds.length - 1;

      if (isLastSinglePair) {
        absorbDeferredSkippers();
        const firstReal =
          (rounds[i] || []).find((m) => !m.losersBye) || (rounds[i] || [])[0];
        const reserved = makeMatch({
          id: newMatchId(counter),
          round: roundNum,
          matchNumber: 1,
          bracket: SIDES.LOSERS,
          team1Id: null,
          team2Id: null,
          status: STATUSES.PENDING,
          losersBye: false,
          wrLosersPair: true,
          wrLosersPairMinRound: firstReal ? firstReal.round : roundNum,
        });
        matches.push(reserved);
        reservedPairMatch = reserved;
        finalMatch = reserved;
        roundNum += 1;

        const pairFeeders = [rounds[i], rounds[i + 1]]
          .flat()
          .filter((m) => !m.losersBye);
        pairFeeders.forEach((m, index) => {
          m.loserNextMatchId = reserved.id;
          m.loserNextSlot = index === 0 ? "team1Id" : "team2Id";
        });

        i += 1;
        continue;
      }

      remaining += dropIns;
      absorbDeferredSkippers();
      if (remaining > 1) {
        emitAndTrack(remaining);
      }
    }

    drainUntilOneOrNone();

    if (reservedPairMatch) {
      remaining += 1;
      drainUntilOneOrNone();
      if (finalMatch && finalMatch.id !== reservedPairMatch.id) {
        reservedPairMatch.nextMatchId = finalMatch.id;
        reservedPairMatch.nextSlot = "team2Id";
      }
    }

    return { matches, finalMatch };
  }

  /**
   * @param {CornholeMatch} match
   * @param {Map<string, CornholeMatch>} byId
   */
  function afterLosersSlotFilled(match, byId) {
    if (match.team1Id && match.team2Id) {
      if (match.status === STATUSES.PENDING) match.status = STATUSES.IN_PROGRESS;
      return;
    }
    if (match.losersBye && (match.team1Id || match.team2Id) && !match.winnerId) {
      const only = match.team1Id || match.team2Id;
      match.winnerId = only;
      match.loserId = null;
      match.status = STATUSES.COMPLETED;
      if (match.nextMatchId) {
        advanceWithSlot(byId, match, only, false);
      } else if (match.bracket === SIDES.LOSERS) {
        // LB one-team byes are not pre-wired; place the winner into a later round.
        placeInNextLosersRound(Array.from(byId.values()), byId, match, only);
      }
    }
  }

  /**
   * @param {CornholeMatch} match
   * @returns {number}
   */
  function losersMatchSlotCount(match) {
    return match.losersBye ? 1 : 2;
  }

  /**
   * @param {CornholeMatch[]} roundMatches
   * @param {Set<string>} prevWinnerIds
   */
  function countLosersRoundFill(roundMatches, prevWinnerIds) {
    let lbAdvanceFilled = 0;
    let wrFilled = 0;
    roundMatches.forEach((m) => {
      [m.team1Id, m.team2Id].forEach((id) => {
        if (!id) return;
        if (prevWinnerIds.has(id)) lbAdvanceFilled += 1;
        else wrFilled += 1;
      });
    });
    return { lbAdvanceFilled, wrFilled };
  }

  /**
   * @param {CornholeMatch[]} roundMatches
   * @param {Map<string, CornholeMatch>} byId
   * @param {string} teamId
   * @param {boolean} asWrDropIn
   * @param {Set<string>} prevWinnerIds
   * @param {boolean} receivesLbAdvance
   * @returns {boolean}
   */
  function placeTeamInLosersRound(
    roundMatches,
    byId,
    teamId,
    asWrDropIn,
    prevWinnerIds,
    receivesLbAdvance
  ) {
    if (asWrDropIn && receivesLbAdvance) {
      // Prefer a match that already has an LB winner, so WR drop-ins play
      // those winners instead of occupying a match by themselves.
      for (let i = 0; i < roundMatches.length; i += 1) {
        const match = roundMatches[i];
        if (match.status === STATUSES.COMPLETED) continue;
        const hasWr = [match.team1Id, match.team2Id].some(
          (id) => id && !prevWinnerIds.has(id)
        );
        if (hasWr) continue;
        const lbOnTeam1 = match.team1Id && prevWinnerIds.has(match.team1Id);
        if (lbOnTeam1 && !match.team2Id) {
          match.team2Id = teamId;
          afterLosersSlotFilled(match, byId);
          return true;
        }
      }
      for (let i = 0; i < roundMatches.length; i += 1) {
        const match = roundMatches[i];
        if (match.status === STATUSES.COMPLETED) continue;
        const hasWr = [match.team1Id, match.team2Id].some(
          (id) => id && !prevWinnerIds.has(id)
        );
        if (hasWr) continue;
        if (!match.losersBye && !match.team2Id) {
          match.team2Id = teamId;
          afterLosersSlotFilled(match, byId);
          return true;
        }
        if (!match.team1Id && match.team2Id && prevWinnerIds.has(match.team2Id)) {
          match.team1Id = teamId;
          afterLosersSlotFilled(match, byId);
          return true;
        }
      }
      return false;
    }

    for (let i = 0; i < roundMatches.length; i += 1) {
      const match = roundMatches[i];
      if (match.status === STATUSES.COMPLETED) continue;
      if (!match.team1Id) {
        match.team1Id = teamId;
        afterLosersSlotFilled(match, byId);
        return true;
      }
      if (!match.losersBye && !match.team2Id) {
        match.team2Id = teamId;
        afterLosersSlotFilled(match, byId);
        return true;
      }
    }
    return false;
  }

  /**
   * Place a winners-bracket loser into the losers bracket.
   * Round 1 WR losers fill the lowest LB slots. Later WR losers drop into the
   * earliest round that still has WR slots opposite LB winners, except the
   * reserved pair match (last two single-loser WR rounds play each other).
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {string} teamId
   * @param {number} [fromRound]
   */
  function placeInHighestLosersSlot(matches, byId, teamId, fromRound) {
    if (!teamId) return;

    const alreadyPlaced = matches.some(
      (m) =>
        (m.bracket === SIDES.LOSERS ||
          m.bracket === SIDES.GRAND_FINAL ||
          m.bracket === SIDES.GRAND_FINAL_RESET) &&
        (m.team1Id === teamId || m.team2Id === teamId)
    );
    if (alreadyPlaced) return;

    const reserved = matches.find(
      (m) =>
        m.bracket === SIDES.LOSERS &&
        m.wrLosersPair &&
        m.active !== false
    );
    const feedsReserved =
      !!reserved &&
      (matches || []).some(
        (m) =>
          m.bracket === SIDES.WINNERS &&
          m.active !== false &&
          m.loserNextMatchId === reserved.id &&
          m.round === (fromRound || 1)
      );
    if (reserved && feedsReserved) {
      if (reserved.status === STATUSES.COMPLETED) return;
      if (!reserved.team1Id) {
        reserved.team1Id = teamId;
        afterLosersSlotFilled(reserved, byId);
        return;
      }
      if (!reserved.team2Id) {
        reserved.team2Id = teamId;
        afterLosersSlotFilled(reserved, byId);
        return;
      }
      // Both slots filled — fall through for any other WR loser.
    }

    const lbMatches = matches
      .filter((m) => m.bracket === SIDES.LOSERS && m.active !== false)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);

    const rounds = [];
    lbMatches.forEach((m) => {
      if (!rounds.includes(m.round)) rounds.push(m.round);
    });
    rounds.sort((a, b) => a - b);

    for (let r = 0; r < rounds.length; r += 1) {
      const round = rounds[r];
      const roundMatches = lbMatches.filter((m) => m.round === round);
      if (roundMatches.some((m) => m.wrLosersPair)) continue;
      const totalSlots = roundMatches.reduce(
        (n, m) => n + losersMatchSlotCount(m),
        0
      );
      const prevMatches = lbMatches.filter(
        (m) => m.round === round - 1 && !m.wrLosersPair
      );
      const skippersFromTwoBack = lbMatches.filter(
        (m) =>
          m.round === round - 2 &&
          !m.wrLosersPair &&
          m.byeToNextRound &&
          !m.losersBye
      ).length;
      const advanceIn =
        prevMatches.filter((m) => !m.byeToNextRound).length + skippersFromTwoBack;
      const wrCapacity = Math.max(0, totalSlots - advanceIn);
      if (wrCapacity <= 0) continue;
      if ((fromRound || 1) >= 2 && advanceIn === 0) continue;

      const prevWinnerIds = new Set(
        [
          ...prevMatches.filter(
            (m) =>
              !m.byeToNextRound &&
              m.status === STATUSES.COMPLETED &&
              m.winnerId
          ),
          ...lbMatches.filter(
            (m) =>
              m.round === round - 2 &&
              !m.wrLosersPair &&
              m.byeToNextRound &&
              !m.losersBye &&
              m.status === STATUSES.COMPLETED &&
              m.winnerId
          ),
        ].map((m) => m.winnerId)
      );
      const { wrFilled, lbAdvanceFilled } = countLosersRoundFill(
        roundMatches,
        prevWinnerIds
      );
      const lbStillComing = Math.max(0, advanceIn - lbAdvanceFilled);
      const openSlots = totalSlots - lbAdvanceFilled - wrFilled;
      const wrSlotsLeft = Math.max(0, wrCapacity - wrFilled);
      const freeForWr = Math.min(
        wrSlotsLeft,
        Math.max(0, openSlots - lbStillComing)
      );
      if (freeForWr <= 0) continue;

      const receivesLbAdvance = advanceIn > 0;
      if (
        placeTeamInLosersRound(
          roundMatches,
          byId,
          teamId,
          true,
          prevWinnerIds,
          receivesLbAdvance
        )
      ) {
        return;
      }
    }

    const gf = matches.find((m) => m.bracket === SIDES.GRAND_FINAL);
    if (gf && !gf.team2Id) {
      gf.team2Id = teamId;
      if (gf.team1Id && gf.team2Id && gf.status === STATUSES.PENDING) {
        gf.status = STATUSES.IN_PROGRESS;
      }
    }
  }

  /**
   * Place a losers-bracket winner into the next round's first open slot.
   * A two-team bye match (odd match count) skips the next round and fills
   * the following round. Otherwise skips a round only when it has no open spots.
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {CornholeMatch} fromMatch
   * @param {string} teamId
   */
  function placeInNextLosersRound(matches, byId, fromMatch, teamId) {
    if (!teamId || !fromMatch) return;

    // Only treat placements in later rounds / finals as "already placed".
    // Teams remain listed on earlier matches they already played.
    const alreadyPlaced = matches.some((m) => {
      if (m.id === fromMatch.id) return false;
      if (m.team1Id !== teamId && m.team2Id !== teamId) return false;
      if (
        m.bracket === SIDES.GRAND_FINAL ||
        m.bracket === SIDES.GRAND_FINAL_RESET
      ) {
        return true;
      }
      return m.bracket === SIDES.LOSERS && m.round > fromMatch.round;
    });
    if (alreadyPlaced) return;

    if (fromMatch.wrLosersPair && fromMatch.nextMatchId) {
      advanceWithSlot(byId, fromMatch, teamId, false);
      return;
    }

    const lbMatches = matches
      .filter((m) => m.bracket === SIDES.LOSERS && m.active !== false)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);

    const maxRound = lbMatches.reduce((max, m) => Math.max(max, m.round), 0);
    let startRound = (fromMatch.round || 1) + 1;
    if (fromMatch.byeToNextRound && !fromMatch.losersBye) {
      startRound += 1;
    }

    for (let round = startRound; round <= maxRound; round += 1) {
      const roundMatches = lbMatches.filter((m) => m.round === round);
      if (roundMatches.length === 0) continue;
      if (roundMatches.every((m) => m.wrLosersPair)) continue;

      const prevHadReserved = lbMatches.some(
        (m) => m.round === round - 1 && m.wrLosersPair
      );
      const prevMatches = lbMatches.filter(
        (m) => m.round === round - 1 && !m.wrLosersPair
      );
      const skippersFromTwoBack = lbMatches.filter(
        (m) =>
          m.round === round - 2 &&
          !m.wrLosersPair &&
          m.byeToNextRound &&
          !m.losersBye
      ).length;
      const advanceIn =
        prevMatches.filter((m) => !m.byeToNextRound).length + skippersFromTwoBack;
      const totalSlots = roundMatches.reduce(
        (n, m) => n + losersMatchSlotCount(m),
        0
      );
      const wrCapacity = prevHadReserved
        ? 0
        : Math.max(0, totalSlots - advanceIn);
      const leaveTeam2ForWr = wrCapacity > 0;

      let placed = false;
      const playable = roundMatches.filter((m) => !m.wrLosersPair);
      const ordered =
        round >= 3
          ? [
              ...playable.filter((m) => !m.losersBye),
              ...playable.filter((m) => m.losersBye),
            ]
          : playable;

      for (let i = 0; i < ordered.length; i += 1) {
        const match = ordered[i];
        if (match.status === STATUSES.COMPLETED) continue;
        if (
          match.losersBye &&
          !canFillLosersTeamBye(match, round, fromMatch, teamId, matches)
        ) {
          continue;
        }
        if (!match.team1Id) {
          match.team1Id = teamId;
          afterLosersSlotFilled(match, byId);
          placed = true;
          break;
        }
        if (leaveTeam2ForWr) continue;
        if (!match.losersBye && !match.team2Id) {
          match.team2Id = teamId;
          afterLosersSlotFilled(match, byId);
          placed = true;
          break;
        }
      }
      if (placed) return;
      // No open spots in this round — try the following round.
    }

    const gf = matches.find((m) => m.bracket === SIDES.GRAND_FINAL);
    if (gf && !gf.team2Id) {
      gf.team2Id = teamId;
      if (gf.team1Id && gf.team2Id && gf.status === STATUSES.PENDING) {
        gf.status = STATUSES.IN_PROGRESS;
      }
    } else if (gf && fromMatch.nextMatchId === gf.id) {
      advanceWithSlot(byId, fromMatch, teamId, false);
    }
  }

  /**
   * Double elimination: WR losers drop into the losers bracket by round and
   * play LB winners. A loss in the losers bracket is elimination. The LB
   * champion goes to the championship.
   * @param {CornholeMatch[]} winnersMatches
   * @param {CornholeMatch[][]} winnersRounds
   * @param {string} winnersFinalId
   * @param {{ value: number }} counter
   */
  function buildLosersAndFinals(winnersMatches, winnersRounds, winnersFinalId, counter) {
    const wrMatches = winnersRounds.flat();

    wrMatches.forEach((m) => {
      m.loserNextMatchId = null;
      m.loserNextSlot = null;
    });

    const extra = [];
    const resetMatch = makeMatch({
      id: newMatchId(counter),
      round: 1,
      matchNumber: 1,
      bracket: SIDES.GRAND_FINAL_RESET,
      active: false,
    });

    const grandFinal = makeMatch({
      id: newMatchId(counter),
      round: 1,
      matchNumber: 1,
      bracket: SIDES.GRAND_FINAL,
      nextMatchId: resetMatch.id,
    });

    const wbFinal = winnersMatches.find((m) => m.id === winnersFinalId);
    if (wbFinal) {
      wbFinal.nextMatchId = grandFinal.id;
      wbFinal.nextSlot = "team1Id";
    }

    const { matches: lbMatches, finalMatch } = buildLosersBracketFromWinnersRounds(
      winnersRounds,
      counter
    );
    if (finalMatch) {
      finalMatch.nextMatchId = grandFinal.id;
      finalMatch.nextSlot = "team2Id";
    }
    extra.push(...lbMatches);

    extra.push(grandFinal, resetMatch);
    return extra;
  }

  /**
   * Attach a third-place match for the two teams that lose the matches feeding the winners-bracket final
   * (the last full round before the championship).
   * @param {CornholeMatch[]} matches
   * @param {CornholeTournamentType} type
   * @param {{ value: number }} counter
   */
  function attachThirdPlaceMatch(matches, type, counter) {
    // Double elimination: 3rd place is the losers-bracket final loser (no separate match).
    if (type === TYPES.DOUBLE_ELIMINATION) return;

    const winnersFinal = matches.find(
      (m) => m.bracket === SIDES.WINNERS && !m.nextMatchId
    );

    if (!winnersFinal) return;

    // Only use the penultimate winners round so a first-round bye path into the
    // final does not count as a third-place feeder.
    const feeders = matches.filter(
      (m) =>
        m.bracket === SIDES.WINNERS &&
        m.round === winnersFinal.round - 1 &&
        m.nextMatchId === winnersFinal.id
    );
    if (feeders.length < 2) return;

    const thirdPlace = makeMatch({
      id: newMatchId(counter),
      round: 1,
      matchNumber: 1,
      bracket: SIDES.THIRD_PLACE,
    });

    feeders.slice(0, 2).forEach((feeder, index) => {
      const slot = index === 0 ? "team1Id" : "team2Id";
      if (!feeder.loserNextMatchId) {
        feeder.loserNextMatchId = thirdPlace.id;
        feeder.loserNextSlot = slot;
      } else {
        feeder.thirdPlaceMatchId = thirdPlace.id;
        feeder.thirdPlaceSlot = slot;
      }
    });

    matches.push(thirdPlace);
  }

  /**
   * Winners-bracket side of the grand final (convention: team1).
   * @param {CornholeMatch[]} matches
   * @param {CornholeMatch} gf
   * @returns {string|null}
   */
  function grandFinalWinnersTeamId(matches, gf) {
    if (!gf) return null;
    const wrFeeder = (matches || []).find(
      (m) =>
        m.bracket === SIDES.WINNERS &&
        m.nextMatchId === gf.id &&
        m.active !== false
    );
    if (wrFeeder && wrFeeder.winnerId) return wrFeeder.winnerId;
    return gf.team1Id || null;
  }

  /**
   * Losers-bracket side of the grand final (convention: team2).
   * @param {CornholeMatch[]} matches
   * @param {CornholeMatch} gf
   * @returns {string|null}
   */
  function grandFinalLosersTeamId(matches, gf) {
    if (!gf) return null;
    const lbFeeder = (matches || []).find(
      (m) =>
        m.bracket === SIDES.LOSERS &&
        m.nextMatchId === gf.id &&
        m.active !== false
    );
    if (lbFeeder && lbFeeder.winnerId) return lbFeeder.winnerId;
    return gf.team2Id || null;
  }

  /**
   * Activate or clear the if-necessary Game 2 when the LB team wins Game 1.
   * @param {CornholeMatch[]} matches
   * @param {CornholeMatch} gf
   * @param {string} winnerId
   */
  function syncGrandFinalReset(matches, gf, winnerId) {
    const reset = matches.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
    if (!gf || !reset) return;

    const lbTeamId = grandFinalLosersTeamId(matches, gf);
    const wrTeamId = grandFinalWinnersTeamId(matches, gf);
    const lbWonGame1 = !!(winnerId && lbTeamId && winnerId === lbTeamId);

    if (lbWonGame1) {
      reset.active = true;
      reset.team1Id = wrTeamId || gf.team1Id;
      reset.team2Id = lbTeamId || gf.team2Id;
      reset.status = STATUSES.IN_PROGRESS;
      reset.winnerId = null;
      reset.loserId = null;
    } else {
      reset.active = false;
      reset.team1Id = null;
      reset.team2Id = null;
      reset.winnerId = null;
      reset.loserId = null;
      reset.status = STATUSES.PENDING;
    }
  }

  /**
   * @param {CornholeMatch[]} matches
   * @returns {{ first: string|null, second: string|null }}
   */
  function firstAndSecond(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const reset = list.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
    const gf = list.find((m) => m.bracket === SIDES.GRAND_FINAL);

    if (gf) {
      const lbTeamId = grandFinalLosersTeamId(list, gf);
      const lbWonGame1 =
        gf.status === STATUSES.COMPLETED &&
        gf.winnerId &&
        lbTeamId &&
        gf.winnerId === lbTeamId;

      if (lbWonGame1) {
        if (reset && reset.active && reset.status === STATUSES.COMPLETED) {
          return { first: reset.winnerId, second: reset.loserId };
        }
        // LB must win Game 2 as well — no champion yet.
        return { first: null, second: null };
      }

      if (gf.status === STATUSES.COMPLETED) {
        return { first: gf.winnerId, second: gf.loserId };
      }
      return { first: null, second: null };
    }

    const final = list.find((m) => m.bracket === SIDES.WINNERS && !m.nextMatchId);
    if (final && final.status === STATUSES.COMPLETED) {
      return { first: final.winnerId, second: final.loserId };
    }
    return { first: null, second: null };
  }

  /**
   * Place a team into the third-place match when appropriate.
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {CornholeMatch} fromMatch
   * @param {string} loserId
   * @param {CornholeTournamentType} type
   */
  function maybeAdvanceToThirdPlace(matches, byId, fromMatch, loserId, type) {
    if (!loserId || !fromMatch.thirdPlaceMatchId) return;
    const third = byId.get(fromMatch.thirdPlaceMatchId);
    if (!third) return;

    if (type === TYPES.DOUBLE_ELIMINATION) {
      const losses = matches.filter(
        (m) =>
          m.status === STATUSES.COMPLETED &&
          m.loserId === loserId &&
          m.active !== false
      ).length;
      if (losses < 2) return;
      const { first, second } = firstAndSecond(matches);
      if (loserId === first || loserId === second) return;
    }

    const preferred = fromMatch.thirdPlaceSlot;
    if (preferred === "team1Id" || preferred === "team2Id") {
      if (!third[preferred] || third[preferred] === loserId) {
        third[preferred] = loserId;
      } else {
        placeTeam(third, loserId);
      }
    } else {
      placeTeam(third, loserId);
    }
    if (third.team1Id && third.team2Id && third.status === STATUSES.PENDING) {
      third.status = STATUSES.IN_PROGRESS;
    }
  }

  /**
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {CornholeTournamentType} type
   */
  function syncThirdPlaceFromFeeders(matches, byId, type) {
    if (type !== TYPES.DOUBLE_ELIMINATION) return;
    matches.forEach((feeder) => {
      if (!feeder.thirdPlaceMatchId) return;
      if (feeder.status !== STATUSES.COMPLETED || !feeder.loserId) return;
      maybeAdvanceToThirdPlace(matches, byId, feeder, feeder.loserId, type);
    });
  }

  /**
   * @param {CornholeTournamentType} type
   * @param {CornholeTeam[]} teams
   * @returns {CornholeMatch[]}
   */
  GameTracker.Cornhole.generateBracket = function generateBracket(type, teams) {
    if (!Array.isArray(teams) || teams.length < 2) {
      throw new Error("At least 2 teams are required to start a tournament.");
    }
    const list = teams.map((t, i) => ({
      ...t,
      id: t.id || `cteam_tmp_${i}`,
      name: t.name || `Team ${i + 1}`,
    }));

    const counter = { value: 1 };
    const { matches, winnersFinalId, allRounds } = buildWinnersBracket(list, counter);

    if (type === TYPES.DOUBLE_ELIMINATION) {
      const winnersRounds = allRounds.map((r) => r.slice());
      const extra = buildLosersAndFinals(matches, winnersRounds, winnersFinalId, counter);
      matches.push(...extra);
    }

    attachThirdPlaceMatch(matches, type, counter);
    return matches;
  };

  /**
   * @param {CornholeMatch[]} matches
   * @param {string} matchId
   * @param {string} winnerId
   * @returns {CornholeMatch[]}
   */
  GameTracker.Cornhole.applyResult = function applyResult(matches, matchId, winnerId) {
    const next = cloneMatches(matches);
    const byId = indexById(next);
    const match = byId.get(matchId);
    if (!match) throw new Error("Match not found.");
    if (match.active === false) throw new Error("This match is not active yet.");
    if (winnerId !== match.team1Id && winnerId !== match.team2Id) {
      throw new Error("Winner must be one of the teams in the match.");
    }
    if (!match.team1Id || !match.team2Id) {
      throw new Error("Both teams must be set before picking a winner.");
    }

    const loserId = winnerId === match.team1Id ? match.team2Id : match.team1Id;
    match.winnerId = winnerId;
    match.loserId = loserId;
    match.status = STATUSES.COMPLETED;

    if (match.bracket === SIDES.LOSERS) {
      placeInNextLosersRound(next, byId, match, winnerId);
    } else if (
      match.bracket === SIDES.WINNERS &&
      inferType(next) === TYPES.DOUBLE_ELIMINATION
    ) {
      advanceWithSlot(byId, match, winnerId, false);
      placeInHighestLosersSlot(next, byId, loserId, match.round);
    } else {
      advanceWithSlot(byId, match, winnerId, false);
      advanceWithSlot(byId, match, loserId, true);
    }

    if (match.bracket === SIDES.GRAND_FINAL) {
      syncGrandFinalReset(next, match, winnerId);
    }

    const type = inferType(next);
    maybeAdvanceToThirdPlace(next, byId, match, loserId, type);
    syncThirdPlaceFromFeeders(next, byId, type);

    return next;
  };

  /**
   * @param {CornholeMatch[]} matches
   * @returns {CornholeTournamentType}
   */
  function inferType(matches) {
    return (matches || []).some((m) => m.bracket === SIDES.GRAND_FINAL)
      ? TYPES.DOUBLE_ELIMINATION
      : TYPES.SINGLE_ELIMINATION;
  }

  /**
   * Rebuild third-place slots from feeder matches (after clears / DE second losses).
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {CornholeTournamentType} type
   */
  function rebuildThirdPlaceSlots(matches, byId, type) {
    const third = matches.find((m) => m.bracket === SIDES.THIRD_PLACE);
    if (!third) return;

    const hadResult = third.status === STATUSES.COMPLETED;
    const prevWinner = third.winnerId;
    const prevLoser = third.loserId;

    third.team1Id = null;
    third.team2Id = null;
    third.winnerId = null;
    third.loserId = null;
    third.status = STATUSES.PENDING;

    matches.forEach((feeder) => {
      if (feeder.status !== STATUSES.COMPLETED || !feeder.loserId) return;
      if (feeder.loserNextMatchId === third.id) {
        advanceWithSlot(byId, feeder, feeder.loserId, true);
      }
      if (feeder.thirdPlaceMatchId === third.id) {
        maybeAdvanceToThirdPlace(matches, byId, feeder, feeder.loserId, type);
      }
    });

    if (
      hadResult &&
      prevWinner &&
      prevLoser &&
      third.team1Id &&
      third.team2Id &&
      [third.team1Id, third.team2Id].includes(prevWinner) &&
      [third.team1Id, third.team2Id].includes(prevLoser)
    ) {
      third.winnerId = prevWinner;
      third.loserId = prevLoser;
      third.status = STATUSES.COMPLETED;
    }
  }

  /**
   * @param {CornholeMatch[]} matches
   * @returns {{
   *   outcomes: { winnerId: string, loserId: string, round: number, matchNumber: number }[],
   *   gfResult: { winnerId: string, loserId: string }|null,
   *   resetWasActive: boolean,
   *   resetResult: { winnerId: string, loserId: string }|null
   * }}
   */
  function snapshotLosersState(matches) {
    const outcomes = matches
      .filter(
        (m) =>
          m.bracket === SIDES.LOSERS &&
          m.status === STATUSES.COMPLETED &&
          m.winnerId &&
          m.loserId &&
          m.active !== false
      )
      .map((m) => ({
        winnerId: m.winnerId,
        loserId: m.loserId,
        round: m.round,
        matchNumber: m.matchNumber,
      }))
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);

    const gf = matches.find((m) => m.bracket === SIDES.GRAND_FINAL);
    const reset = matches.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
    return {
      outcomes,
      gfResult:
        gf && gf.status === STATUSES.COMPLETED && gf.winnerId && gf.loserId
          ? { winnerId: gf.winnerId, loserId: gf.loserId }
          : null,
      resetWasActive: !!(reset && reset.active),
      resetResult:
        reset && reset.active && reset.status === STATUSES.COMPLETED && reset.winnerId && reset.loserId
          ? { winnerId: reset.winnerId, loserId: reset.loserId }
          : null,
    };
  }

  /**
   * Clear losers-bracket / grand-final team slots and rebuild from current
   * winners-bracket results, then replay still-valid losers-bracket outcomes.
   * @param {CornholeMatch[]} matches
   * @param {Map<string, CornholeMatch>} byId
   * @param {ReturnType<typeof snapshotLosersState>} snapshot
   */
  function rebuildLosersFromSnapshot(matches, byId, snapshot) {
    matches.forEach((m) => {
      if (m.bracket !== SIDES.LOSERS || m.active === false) return;
      m.team1Id = null;
      m.team2Id = null;
      m.winnerId = null;
      m.loserId = null;
      m.status = STATUSES.PENDING;
      m.roundByeTeamId = null;
    });

    const gf = matches.find((m) => m.bracket === SIDES.GRAND_FINAL);
    const reset = matches.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
    if (gf) {
      gf.team1Id = null;
      gf.team2Id = null;
      gf.winnerId = null;
      gf.loserId = null;
      gf.status = STATUSES.PENDING;
    }
    if (reset) {
      reset.active = false;
      reset.team1Id = null;
      reset.team2Id = null;
      reset.winnerId = null;
      reset.loserId = null;
      reset.status = STATUSES.PENDING;
    }

    matches
      .filter(
        (m) =>
          m.bracket === SIDES.WINNERS &&
          m.status === STATUSES.COMPLETED &&
          m.loserId &&
          m.active !== false
      )
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber)
      .forEach((m) => {
        placeInHighestLosersSlot(matches, byId, m.loserId, m.round);
      });

    if (gf) {
      const wrFinal = matches.find(
        (m) =>
          m.bracket === SIDES.WINNERS &&
          m.nextMatchId === gf.id &&
          m.status === STATUSES.COMPLETED &&
          m.winnerId
      );
      if (wrFinal) {
        gf.team1Id = wrFinal.winnerId;
      }
    }

    const pending = (snapshot.outcomes || []).slice();
    let guard = 0;
    while (pending.length > 0 && guard < 200) {
      guard += 1;
      let applied = false;
      for (let i = 0; i < pending.length; i += 1) {
        const outcome = pending[i];
        const match = matches.find(
          (m) =>
            m.bracket === SIDES.LOSERS &&
            m.status !== STATUSES.COMPLETED &&
            m.team1Id &&
            m.team2Id &&
            ((m.team1Id === outcome.winnerId && m.team2Id === outcome.loserId) ||
              (m.team2Id === outcome.winnerId && m.team1Id === outcome.loserId))
        );
        if (!match) continue;
        match.winnerId = outcome.winnerId;
        match.loserId = outcome.loserId;
        match.status = STATUSES.COMPLETED;
        placeInNextLosersRound(matches, byId, match, outcome.winnerId);
        pending.splice(i, 1);
        applied = true;
        break;
      }
      if (!applied) break;
    }

    if (gf && gf.team1Id && gf.team2Id) {
      gf.status = STATUSES.IN_PROGRESS;
    }

    if (
      gf &&
      snapshot.gfResult &&
      gf.team1Id &&
      gf.team2Id &&
      [gf.team1Id, gf.team2Id].includes(snapshot.gfResult.winnerId) &&
      [gf.team1Id, gf.team2Id].includes(snapshot.gfResult.loserId)
    ) {
      gf.winnerId = snapshot.gfResult.winnerId;
      gf.loserId = snapshot.gfResult.loserId;
      gf.status = STATUSES.COMPLETED;
      syncGrandFinalReset(matches, gf, gf.winnerId);
      if (
        reset &&
        reset.active &&
        snapshot.resetResult &&
        [reset.team1Id, reset.team2Id].includes(snapshot.resetResult.winnerId) &&
        [reset.team1Id, reset.team2Id].includes(snapshot.resetResult.loserId)
      ) {
        reset.winnerId = snapshot.resetResult.winnerId;
        reset.loserId = snapshot.resetResult.loserId;
        reset.status = STATUSES.COMPLETED;
      }
    } else if (gf && snapshot.resetWasActive && reset) {
      const lbTeamId = grandFinalLosersTeamId(matches, gf);
      if (gf.winnerId && lbTeamId && gf.winnerId === lbTeamId) {
        syncGrandFinalReset(matches, gf, gf.winnerId);
      }
    }
  }

  /**
   * @param {CornholeMatch[]} matches
   * @param {string} matchId
   * @returns {CornholeMatch[]}
   */
  GameTracker.Cornhole.clearResult = function clearResult(matches, matchId) {
    const next = cloneMatches(matches);
    const byId = indexById(next);
    const match = byId.get(matchId);
    if (!match) throw new Error("Match not found.");

    const clearedWinner = match.winnerId;
    const clearedLoser = match.loserId;
    const isDE = inferType(next) === TYPES.DOUBLE_ELIMINATION;
    const losersSnapshot = isDE ? snapshotLosersState(next) : null;

    function wipeForward(startId, teamId) {
      if (!startId || !teamId) return;
      const seen = new Set();
      let cursor = startId;
      while (cursor && !seen.has(cursor)) {
        seen.add(cursor);
        const dest = byId.get(cursor);
        if (!dest) break;
        const priorWinner = dest.winnerId;
        const priorLoser = dest.loserId;
        removeTeam(dest, teamId);
        if (priorWinner) {
          wipeForward(dest.nextMatchId, priorWinner);
        }
        if (priorLoser) {
          wipeForward(dest.loserNextMatchId, priorLoser);
        }
        if (dest.bracket === SIDES.GRAND_FINAL_RESET) {
          dest.active = false;
          dest.team1Id = null;
          dest.team2Id = null;
          dest.winnerId = null;
          dest.loserId = null;
          dest.status = STATUSES.PENDING;
        }
        cursor = dest.nextMatchId;
      }
    }

    match.winnerId = null;
    match.loserId = null;
    match.status =
      match.team1Id && match.team2Id ? STATUSES.IN_PROGRESS : STATUSES.PENDING;

    if (clearedWinner) {
      wipeForward(match.nextMatchId, clearedWinner);
    }
    if (clearedLoser) {
      wipeForward(match.loserNextMatchId, clearedLoser);
      wipeForward(match.thirdPlaceMatchId, clearedLoser);
    }

    if (match.bracket === SIDES.GRAND_FINAL) {
      const reset = next.find((m) => m.bracket === SIDES.GRAND_FINAL_RESET);
      if (reset) {
        reset.active = false;
        reset.team1Id = null;
        reset.team2Id = null;
        reset.winnerId = null;
        reset.loserId = null;
        reset.status = STATUSES.PENDING;
      }
      if (losersSnapshot) {
        losersSnapshot.gfResult = null;
        losersSnapshot.resetResult = null;
        losersSnapshot.resetWasActive = false;
      }
    }

    if (match.bracket === SIDES.GRAND_FINAL_RESET && losersSnapshot) {
      losersSnapshot.resetResult = null;
    }

    if (isDE && losersSnapshot) {
      if (match.bracket === SIDES.LOSERS && clearedWinner && clearedLoser) {
        losersSnapshot.outcomes = losersSnapshot.outcomes.filter(
          (o) => !(o.winnerId === clearedWinner && o.loserId === clearedLoser)
        );
      }
      rebuildLosersFromSnapshot(next, byId, losersSnapshot);
    }

    rebuildThirdPlaceSlots(next, byId, inferType(next));

    return next;
  };

  /**
   * @param {CornholeMatch[]} matches
   * @returns {string|null}
   */
  GameTracker.Cornhole.championId = function championId(matches) {
    return firstAndSecond(matches).first;
  };

  /**
   * Final standings once the tournament has a champion.
   * Double elimination: 1st/2nd from grand final (or reset), 3rd is losers-bracket final loser.
   * Single elimination: 1st/2nd from championship, 3rd from third-place match when played.
   * @param {CornholeMatch[]} matches
   * @returns {{ first: string|null, second: string|null, third: string|null }}
   */
  GameTracker.Cornhole.topThree = function topThree(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const { first, second } = firstAndSecond(list);
    if (!first) {
      return { first: null, second: null, third: null };
    }

    const gf = list.find((m) => m.bracket === SIDES.GRAND_FINAL);
    if (gf) {
      const lbFinal =
        list.find(
          (m) =>
            m.bracket === SIDES.LOSERS &&
            m.nextMatchId === gf.id &&
            m.active !== false
        ) ||
        (() => {
          const lb = list.filter(
            (m) => m.bracket === SIDES.LOSERS && m.active !== false
          );
          if (lb.length === 0) return null;
          const maxRound = Math.max(...lb.map((m) => m.round));
          return lb
            .filter((m) => m.round === maxRound)
            .sort((a, b) => a.matchNumber - b.matchNumber)[0];
        })();
      const third =
        lbFinal && lbFinal.status === STATUSES.COMPLETED ? lbFinal.loserId : null;
      return { first, second, third };
    }

    const thirdMatch = list.find((m) => m.bracket === SIDES.THIRD_PLACE);
    const third =
      thirdMatch && thirdMatch.status === STATUSES.COMPLETED
        ? thirdMatch.winnerId
        : null;
    return { first, second, third };
  };

  /**
   * @param {CornholeMatch[]} matches
   * @param {string} teamId
   * @returns {number}
   */
  GameTracker.Cornhole.teamLossCount = function teamLossCount(matches, teamId) {
    if (!teamId) return 0;
    return (matches || []).filter(
      (m) => m.status === STATUSES.COMPLETED && m.loserId === teamId && m.active !== false
    ).length;
  };

  /**
   * @param {CornholeMatch[]} matches
   * @param {string} teamId
   * @param {CornholeTournamentType} type
   * @returns {boolean}
   */
  GameTracker.Cornhole.isEliminated = function isEliminated(matches, teamId, type) {
    const losses = GameTracker.Cornhole.teamLossCount(matches, teamId);
    if (type === TYPES.DOUBLE_ELIMINATION) return losses >= 2;
    return losses >= 1;
  };
})();
