/**
 * Load players from the existing Players API for Cornhole team assignment.
 */
window.GameTracker = window.GameTracker || {};
window.GameTracker.Cornhole = window.GameTracker.Cornhole || {};

const CORNHOLE_PLAYERS_API_URL = "api/players.php";

/**
 * Fetch all players from the shared Players store, sorted by name.
 * @returns {Promise<CornholePlayer[]>}
 */
GameTracker.Cornhole.fetchPlayers = async function fetchPlayers() {
  const data = await GameTracker.api(CORNHOLE_PLAYERS_API_URL, "GET");
  const players = Array.isArray(data) ? data : [];
  return GameTracker.sortByName(players);
};
