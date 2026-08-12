/**
 * Cornhole tournament API helpers.
 */
window.GameTracker = window.GameTracker || {};
window.GameTracker.Cornhole = window.GameTracker.Cornhole || {};

const CORNHOLE_TOURNAMENTS_API_URL = "api/cornhole-tournaments.php";

/**
 * @returns {Promise<CornholeTournament[]>}
 */
GameTracker.Cornhole.fetchTournaments = async function fetchTournaments() {
  const data = await GameTracker.api(CORNHOLE_TOURNAMENTS_API_URL, "GET");
  return Array.isArray(data) ? data : [];
};

/**
 * @param {string} id
 * @returns {Promise<CornholeTournament>}
 */
GameTracker.Cornhole.fetchTournament = async function fetchTournament(id) {
  const url = `${CORNHOLE_TOURNAMENTS_API_URL}?id=${encodeURIComponent(id)}`;
  return GameTracker.api(url, "GET");
};

/**
 * Create or update a Cornhole tournament.
 * @param {Partial<CornholeTournament> & { name?: string, type: CornholeTournamentType, teams: CornholeTeam[] }} payload
 * @returns {Promise<CornholeTournament>}
 */
GameTracker.Cornhole.saveTournament = async function saveTournament(payload) {
  const hasId = payload && payload.id;
  const method = hasId ? "PUT" : "POST";
  return GameTracker.api(CORNHOLE_TOURNAMENTS_API_URL, method, payload);
};
