/**
 * Cornhole bracket domain types (JSDoc). Parallel to card-game tournaments/teams.
 *
 * @typedef {'SINGLE_ELIMINATION' | 'DOUBLE_ELIMINATION'} CornholeTournamentType
 * @typedef {'PENDING' | 'IN_PROGRESS' | 'COMPLETED'} CornholeMatchStatus
 * @typedef {'SETUP' | 'ACTIVE' | 'COMPLETED'} CornholeTournamentStatus
 * @typedef {'WINNERS' | 'LOSERS' | 'GRAND_FINAL' | 'GRAND_FINAL_RESET' | 'THIRD_PLACE'} CornholeBracketSide
 *
 * @typedef {Object} CornholePlayer
 * @property {string} id
 * @property {string} name
 * @property {string} [nickname]
 *
 * @typedef {Object} CornholeTeam
 * @property {string} id
 * @property {string} name
 * @property {string} player1Id
 * @property {string} player2Id
 * @property {string} [player1Name]
 * @property {string} [player2Name]
 *
 * @typedef {Object} CornholeMatch
 * @property {string} id
 * @property {number} round
 * @property {number} matchNumber
 * @property {CornholeBracketSide} bracket
 * @property {string|null} team1Id
 * @property {string|null} team2Id
 * @property {string|null} winnerId
 * @property {string|null} loserId
 * @property {string|null} nextMatchId
 * @property {string|null} loserNextMatchId
 * @property {string|null} [thirdPlaceMatchId]
 * @property {string|null} [thirdPlaceSlot]
 * @property {boolean} [losersBye]
 * @property {boolean} [byeToNextRound]
 * @property {boolean} [wrLosersPair]
 * @property {number|null} [wrLosersPairMinRound]
 * @property {string|null} [roundByeTeamId]
 * @property {CornholeMatchStatus} status
 * @property {boolean} [active]
 *
 * @typedef {Object} CornholeTournament
 * @property {string} id
 * @property {string} name
 * @property {CornholeTournamentType} type
 * @property {CornholeTeam[]} teams
 * @property {CornholeMatch[]} matches
 * @property {CornholeTournamentStatus} status
 */

window.GameTracker = window.GameTracker || {};
window.GameTracker.Cornhole = window.GameTracker.Cornhole || {};

GameTracker.Cornhole.TOURNAMENT_TYPES = Object.freeze({
  SINGLE_ELIMINATION: "SINGLE_ELIMINATION",
  DOUBLE_ELIMINATION: "DOUBLE_ELIMINATION",
});

GameTracker.Cornhole.MATCH_STATUSES = Object.freeze({
  PENDING: "PENDING",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
});

GameTracker.Cornhole.TOURNAMENT_STATUSES = Object.freeze({
  SETUP: "SETUP",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
});

GameTracker.Cornhole.BRACKET_SIDES = Object.freeze({
  WINNERS: "WINNERS",
  LOSERS: "LOSERS",
  GRAND_FINAL: "GRAND_FINAL",
  GRAND_FINAL_RESET: "GRAND_FINAL_RESET",
  THIRD_PLACE: "THIRD_PLACE",
});

/** Maximum teams allowed in a Cornhole tournament. */
GameTracker.Cornhole.MAX_TEAMS = 20;

/** Minimum teams required for a Cornhole bracket. */
GameTracker.Cornhole.MIN_TEAMS = 2;
