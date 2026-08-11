<?php
/**
 * Tournaments API — CRUD against ../data/tournaments.json
 * competitorType: "player" (default) | "team"
 * scoringMode: "gameWins" (default) | "points"
 * Roster: competitorIds (legacy playerIds still accepted/read)
 * Plays (gameWins): POST/PUT { tournamentId, playId?, gameId, winnerIds? }
 * Plays (points):   POST/PUT { tournamentId, playId?, gameId, placementIds? }
 * winnerIds / placementIds: entity-neutral; legacy winnerPlayerIds / placementPlayerIds accepted.
 * DELETE { tournamentId, playId }
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tournaments.json';
$playersFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';
$teamsFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'teams.json';
$gamesFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'games.json';

function normalizeStatus($value): string
{
    $status = strtolower(trim((string) ($value ?? '')));
    if ($status === '') {
        return 'active';
    }
    if ($status !== 'active' && $status !== 'ended') {
        respond(400, ['error' => 'Status must be active or ended']);
    }
    return $status;
}

function normalizeDate($value): string
{
    $date = trim((string) ($value ?? ''));
    if ($date === '') {
        respond(400, ['error' => 'Date is required']);
    }
    $dt = DateTime::createFromFormat('Y-m-d', $date);
    $errors = DateTime::getLastErrors();
    if (
        $dt === false
        || ($errors['warning_count'] ?? 0) > 0
        || ($errors['error_count'] ?? 0) > 0
        || $dt->format('Y-m-d') !== $date
    ) {
        respond(400, ['error' => 'Date must be YYYY-MM-DD']);
    }
    return $date;
}

function loadIdSet(string $path, string $corruptMessage): array
{
    $rows = loadJsonArray($path, $corruptMessage);
    $ids = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $id = isset($row['id']) ? (string) $row['id'] : '';
        if ($id !== '') {
            $ids[$id] = true;
        }
    }
    return $ids;
}

function normalizeCompetitorType($value): string
{
    $type = strtolower(trim((string) ($value ?? '')));
    if ($type === '' || $type === 'player' || $type === 'players') {
        return 'player';
    }
    if ($type === 'team' || $type === 'teams') {
        return 'team';
    }
    respond(400, ['error' => 'competitorType must be player or team']);
}

function rosterIdsFromTournament(array $tournament): array
{
    if (isset($tournament['competitorIds']) && is_array($tournament['competitorIds'])) {
        return array_values(array_map('strval', $tournament['competitorIds']));
    }
    if (isset($tournament['playerIds']) && is_array($tournament['playerIds'])) {
        return array_values(array_map('strval', $tournament['playerIds']));
    }
    return [];
}

function normalizeCompetitorIds($value, string $competitorType, string $playersPath, string $teamsPath, bool $required): array
{
    if ($value === null) {
        $value = [];
    }
    if (!is_array($value)) {
        respond(400, ['error' => 'competitorIds must be an array']);
    }

    $path = $competitorType === 'team' ? $teamsPath : $playersPath;
    $corrupt = $competitorType === 'team' ? 'Corrupt teams.json' : 'Corrupt players.json';
    $label = $competitorType === 'team' ? 'team' : 'player';
    $validIds = loadIdSet($path, $corrupt);
    $competitorIds = [];
    $seen = [];

    foreach ($value as $id) {
        $id = trim((string) $id);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        if (!isset($validIds[$id])) {
            respond(400, ['error' => 'Unknown ' . $label . ' id: ' . $id]);
        }
        $seen[$id] = true;
        $competitorIds[] = $id;
    }

    if ($required && count($competitorIds) === 0) {
        respond(400, ['error' => 'At least one ' . $label . ' is required']);
    }

    return $competitorIds;
}

/** Accept competitorIds or legacy playerIds from request body. */
function competitorIdsFromBody(array $body)
{
    if (array_key_exists('competitorIds', $body)) {
        return $body['competitorIds'];
    }
    if (array_key_exists('playerIds', $body)) {
        return $body['playerIds'];
    }
    return null;
}

function getPlays(array $tournament): array
{
    if (!isset($tournament['plays']) || !is_array($tournament['plays'])) {
        return [];
    }
    return array_values($tournament['plays']);
}

function findTournamentIndex(array $tournaments, string $id): int
{
    foreach ($tournaments as $i => $tournament) {
        if (($tournament['id'] ?? '') === $id) {
            return $i;
        }
    }
    return -1;
}

function tournamentNameConflict(array $tournaments, string $name, string $excludeId = ''): string
{
    $needle = strtolower(trim($name));
    if ($needle === '') {
        return '';
    }
    $previouslyUsed = false;
    foreach ($tournaments as $tournament) {
        if (!is_array($tournament)) {
            continue;
        }
        $id = isset($tournament['id']) ? (string) $tournament['id'] : '';
        if ($excludeId !== '' && $id === $excludeId) {
            continue;
        }
        $existing = strtolower(trim((string) ($tournament['name'] ?? '')));
        if ($existing === $needle) {
            if (normalizeStatus($tournament['status'] ?? 'active') === 'active') {
                return 'active';
            }
            $previouslyUsed = true;
        }
    }
    return $previouslyUsed ? 'previous' : '';
}

const MAX_WINNERS_PER_PLAY = 4;
const MAX_PLACES_PER_PLAY = 3;
const MAX_PLAYERS_PER_PLACE = 4;
const MAX_PLACEMENTS_PER_PLAY = MAX_PLACES_PER_PLAY;

function normalizeScoringMode($value): string
{
    $mode = strtolower(trim((string) ($value ?? '')));
    if ($mode === '' || $mode === 'gamewins' || $mode === 'game_wins') {
        return 'gameWins';
    }
    if ($mode === 'points') {
        return 'points';
    }
    respond(400, ['error' => 'scoringMode must be gameWins or points']);
}

function normalizePlayWinners(array $play): array
{
    if (isset($play['winnerIds']) && is_array($play['winnerIds'])) {
        $source = $play['winnerIds'];
    } elseif (isset($play['winnerPlayerIds']) && is_array($play['winnerPlayerIds'])) {
        $source = $play['winnerPlayerIds'];
    } else {
        $single = isset($play['winnerPlayerId']) ? trim((string) $play['winnerPlayerId']) : '';
        return $single !== '' ? [$single] : [];
    }

    $ids = [];
    $seen = [];
    foreach ($source as $id) {
        $id = trim((string) $id);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $ids[] = $id;
        if (count($ids) >= MAX_WINNERS_PER_PLAY) {
            break;
        }
    }
    return $ids;
}

function normalizePlayPlacements(array $play): array
{
    if (isset($play['placementIds']) && is_array($play['placementIds'])) {
        $source = $play['placementIds'];
    } elseif (isset($play['placementPlayerIds']) && is_array($play['placementPlayerIds'])) {
        $source = $play['placementPlayerIds'];
    } else {
        return [];
    }

    if (!count($source)) {
        return [];
    }

    $seen = [];
    $groups = [];
    for ($place = 0; $place < MAX_PLACES_PER_PLAY; $place++) {
        $groups[$place] = [];
    }

    $isNested = false;
    foreach ($source as $entry) {
        if (is_array($entry)) {
            $isNested = true;
            break;
        }
    }

    if ($isNested) {
        for ($place = 0; $place < MAX_PLACES_PER_PLAY; $place++) {
            $group = isset($source[$place]) && is_array($source[$place]) ? $source[$place] : [];
            foreach ($group as $id) {
                $id = trim((string) $id);
                if ($id === '' || isset($seen[$id])) {
                    continue;
                }
                $seen[$id] = true;
                $groups[$place][] = $id;
                if (count($groups[$place]) >= MAX_PLAYERS_PER_PLACE) {
                    break;
                }
            }
        }
    } else {
        for ($place = 0; $place < MAX_PLACES_PER_PLAY && $place < count($source); $place++) {
            $id = trim((string) $source[$place]);
            if ($id === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $groups[$place][] = $id;
        }
    }

    $hasAny = false;
    foreach ($groups as $group) {
        if (count($group) > 0) {
            $hasAny = true;
            break;
        }
    }
    return $hasAny ? array_values($groups) : [];
}

function flattenPlacementGroups(array $groups): array
{
    $ids = [];
    foreach ($groups as $group) {
        if (!is_array($group)) {
            continue;
        }
        foreach ($group as $id) {
            $ids[] = $id;
        }
    }
    return $ids;
}

function parsePlacementIdsFromBody(array $body): array
{
    $source = null;
    if (isset($body['placementIds'])) {
        if (!is_array($body['placementIds'])) {
            respond(400, ['error' => 'placementIds must be an array']);
        }
        $source = $body['placementIds'];
    } elseif (isset($body['placementPlayerIds'])) {
        if (!is_array($body['placementPlayerIds'])) {
            respond(400, ['error' => 'placementPlayerIds must be an array']);
        }
        $source = $body['placementPlayerIds'];
    } else {
        return [];
    }

    if (!count($source)) {
        return [];
    }

    $seen = [];
    $groups = [];
    for ($place = 0; $place < MAX_PLACES_PER_PLAY; $place++) {
        $groups[$place] = [];
    }

    $isNested = false;
    foreach ($source as $entry) {
        if (is_array($entry)) {
            $isNested = true;
            break;
        }
    }

    if ($isNested) {
        for ($place = 0; $place < MAX_PLACES_PER_PLAY; $place++) {
            $group = isset($source[$place]) && is_array($source[$place]) ? $source[$place] : [];
            foreach ($group as $id) {
                $id = trim((string) $id);
                if ($id === '') {
                    continue;
                }
                if (isset($seen[$id])) {
                    respond(400, ['error' => 'Duplicate placement is not allowed']);
                }
                $seen[$id] = true;
                $groups[$place][] = $id;
                if (count($groups[$place]) > MAX_PLAYERS_PER_PLACE) {
                    respond(400, ['error' => 'A place can have at most ' . MAX_PLAYERS_PER_PLACE . ' competitors']);
                }
            }
        }
    } else {
        for ($place = 0; $place < count($source); $place++) {
            $id = trim((string) $source[$place]);
            if ($id === '') {
                continue;
            }
            if (isset($seen[$id])) {
                respond(400, ['error' => 'Duplicate placement is not allowed']);
            }
            $seen[$id] = true;
            if ($place >= MAX_PLACES_PER_PLAY) {
                respond(400, ['error' => 'A game can have at most ' . MAX_PLACES_PER_PLAY . ' places']);
            }
            $groups[$place][] = $id;
        }
    }

    $hasAny = false;
    foreach ($groups as $group) {
        if (count($group) > 0) {
            $hasAny = true;
            break;
        }
    }
    return $hasAny ? array_values($groups) : [];
}

function parseWinnerIdsFromBody(array $body): array
{
    $source = null;
    if (isset($body['winnerIds'])) {
        if (!is_array($body['winnerIds'])) {
            respond(400, ['error' => 'winnerIds must be an array']);
        }
        $source = $body['winnerIds'];
    } elseif (isset($body['winnerPlayerIds'])) {
        if (!is_array($body['winnerPlayerIds'])) {
            respond(400, ['error' => 'winnerPlayerIds must be an array']);
        }
        $source = $body['winnerPlayerIds'];
    } elseif (array_key_exists('winnerPlayerId', $body)) {
        $winnerPlayerId = trim((string) $body['winnerPlayerId']);
        return $winnerPlayerId !== '' ? [$winnerPlayerId] : [];
    } else {
        return [];
    }

    $ids = [];
    $seen = [];
    foreach ($source as $id) {
        $id = trim((string) $id);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        $seen[$id] = true;
        $ids[] = $id;
    }
    return $ids;
}

function bodyHasWinners(array $body): bool
{
    return array_key_exists('winnerIds', $body)
        || array_key_exists('winnerPlayerIds', $body)
        || array_key_exists('winnerPlayerId', $body);
}

function bodyHasPlacements(array $body): bool
{
    return array_key_exists('placementIds', $body)
        || array_key_exists('placementPlayerIds', $body);
}

function validateWinnerIds(array $winnerIds, array $roster, string $competitorType): void
{
    if (count($winnerIds) > MAX_WINNERS_PER_PLAY) {
        respond(400, ['error' => 'A game can have at most ' . MAX_WINNERS_PER_PLAY . ' winners']);
    }

    $label = $competitorType === 'team' ? 'team' : 'player';
    $seen = [];
    foreach ($winnerIds as $id) {
        if (isset($seen[$id])) {
            respond(400, ['error' => 'Duplicate winner is not allowed']);
        }
        $seen[$id] = true;
        if (!in_array($id, $roster, true)) {
            respond(400, ['error' => 'Winner must be a ' . $label . ' in the tournament']);
        }
    }
}

function validatePlacementIds(array $placementIds, array $roster, string $competitorType): void
{
    $groups = $placementIds;
    $looksNested = false;
    foreach ($placementIds as $entry) {
        if (is_array($entry)) {
            $looksNested = true;
            break;
        }
    }
    if (!$looksNested && count($placementIds) > 0) {
        // Legacy flat list — treat as one id per place
        $groups = [];
        for ($place = 0; $place < MAX_PLACES_PER_PLAY; $place++) {
            $groups[$place] = [];
        }
        foreach ($placementIds as $place => $id) {
            if ($place >= MAX_PLACES_PER_PLAY) {
                respond(400, ['error' => 'A game can have at most ' . MAX_PLACES_PER_PLAY . ' places']);
            }
            $groups[$place][] = $id;
        }
        $groups = array_values($groups);
    }

    if (count($groups) > MAX_PLACES_PER_PLAY) {
        respond(400, ['error' => 'A game can have at most ' . MAX_PLACES_PER_PLAY . ' places']);
    }

    $label = $competitorType === 'team' ? 'team' : 'player';
    $seen = [];
    foreach ($groups as $group) {
        if (!is_array($group)) {
            respond(400, ['error' => 'placementIds must be an array of place groups']);
        }
        if (count($group) > MAX_PLAYERS_PER_PLACE) {
            respond(400, ['error' => 'A place can have at most ' . MAX_PLAYERS_PER_PLACE . ' competitors']);
        }
        foreach ($group as $id) {
            if (isset($seen[$id])) {
                respond(400, ['error' => 'Duplicate placement is not allowed']);
            }
            $seen[$id] = true;
            if (!in_array($id, $roster, true)) {
                respond(400, ['error' => 'Placement must be a ' . $label . ' in the tournament']);
            }
        }
    }
}

function formatPlayForStorage(string $playId, string $gameId, string $scoringMode, array $resultIds): array
{
    $play = [
        'id' => $playId,
        'gameId' => $gameId,
    ];
    if ($scoringMode === 'points') {
        $play['placementIds'] = array_values($resultIds);
    } else {
        $play['winnerIds'] = array_values($resultIds);
    }
    return $play;
}

function formatPlayForResponse(array $play): array
{
    $response = [
        'id' => (string) ($play['id'] ?? ''),
        'gameId' => (string) ($play['gameId'] ?? ''),
    ];
    if (array_key_exists('placementIds', $play) || array_key_exists('placementPlayerIds', $play)) {
        $response['placementIds'] = normalizePlayPlacements($play);
    } else {
        $response['winnerIds'] = normalizePlayWinners($play);
    }
    return $response;
}

function normalizeTournamentForResponse(array $tournament): array
{
    $plays = getPlays($tournament);
    $normalizedPlays = [];
    foreach ($plays as $play) {
        if (!is_array($play)) {
            continue;
        }
        $normalizedPlays[] = formatPlayForResponse($play);
    }
    $tournament['plays'] = $normalizedPlays;
    $tournament['scoringMode'] = normalizeScoringMode($tournament['scoringMode'] ?? 'gameWins');
    $tournament['competitorType'] = normalizeCompetitorType($tournament['competitorType'] ?? 'player');
    $tournament['competitorIds'] = rosterIdsFromTournament($tournament);
    // Keep playerIds for older clients reading the same response.
    $tournament['playerIds'] = $tournament['competitorIds'];
    return $tournament;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $tournaments = loadJsonArray($dataFile, 'Corrupt tournaments.json');
    if (isset($_GET['id']) && (string) $_GET['id'] !== '') {
        $id = (string) $_GET['id'];
        $index = findTournamentIndex($tournaments, $id);
        if ($index < 0) {
            respond(404, ['error' => 'Tournament not found']);
        }
        respond(200, normalizeTournamentForResponse($tournaments[$index]));
    }
    respond(200, array_map('normalizeTournamentForResponse', $tournaments));
}

if ($method === 'POST') {
    $body = readBody();

    // Add a play to an active tournament.
    if (isset($body['tournamentId'])) {
        $tournamentId = trim((string) $body['tournamentId']);
        $gameId = isset($body['gameId']) ? trim((string) $body['gameId']) : '';
        if ($tournamentId === '') {
            respond(400, ['error' => 'tournamentId is required']);
        }
        if ($gameId === '') {
            respond(400, ['error' => 'gameId is required']);
        }

        $validGames = loadIdSet($gamesFile, 'Corrupt games.json');
        if (!isset($validGames[$gameId])) {
            respond(400, ['error' => 'Unknown game id']);
        }

        $hasWinners = bodyHasWinners($body);
        $hasPlacements = bodyHasPlacements($body);
        $winnerIds = parseWinnerIdsFromBody($body);
        $placementIds = parsePlacementIdsFromBody($body);
        $play = null;

        mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use (
            $tournamentId,
            $gameId,
            $hasWinners,
            $hasPlacements,
            $winnerIds,
            $placementIds,
            &$play
        ) {
            $index = findTournamentIndex($tournaments, $tournamentId);
            if ($index < 0) {
                respond(404, ['error' => 'Tournament not found']);
            }

            $tournament = $tournaments[$index];
            if (normalizeStatus($tournament['status'] ?? 'active') !== 'active') {
                respond(400, ['error' => 'Games can only be added to active tournaments']);
            }

            $scoringMode = normalizeScoringMode($tournament['scoringMode'] ?? 'gameWins');
            $competitorType = normalizeCompetitorType($tournament['competitorType'] ?? 'player');
            if ($scoringMode === 'points') {
                if ($hasWinners) {
                    respond(400, ['error' => 'This tournament uses points scoring; send placementIds']);
                }
                $resultIds = $placementIds;
            } else {
                if ($hasPlacements) {
                    respond(400, ['error' => 'This tournament uses game wins; send winnerIds']);
                }
                $resultIds = $winnerIds;
            }

            $roster = rosterIdsFromTournament($tournament);
            if ($scoringMode === 'points') {
                validatePlacementIds($resultIds, $roster, $competitorType);
            } else {
                validateWinnerIds($resultIds, $roster, $competitorType);
            }

            $play = formatPlayForStorage(newId('tournament_'), $gameId, $scoringMode, $resultIds);
            $plays = getPlays($tournament);
            $plays[] = $play;
            $tournaments[$index]['plays'] = $plays;
            $tournaments[$index]['competitorIds'] = $roster;
            $tournaments[$index]['competitorType'] = $competitorType;

            return $tournaments;
        });
        respond(201, formatPlayForResponse($play));
    }

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $status = normalizeStatus($body['status'] ?? 'active');
    $competitorType = normalizeCompetitorType($body['competitorType'] ?? 'player');
    $rawCompetitorIds = competitorIdsFromBody($body);
    if ($rawCompetitorIds === null) {
        $rawCompetitorIds = [];
    }
    $competitorIds = normalizeCompetitorIds($rawCompetitorIds, $competitorType, $playersFile, $teamsFile, true);
    $date = normalizeDate($body['date'] ?? '');
    $scoringMode = normalizeScoringMode($body['scoringMode'] ?? 'gameWins');

    $tournament = [
        'id' => newId('tournament_'),
        'name' => $name,
        'date' => $date,
        'status' => $status,
        'scoringMode' => $scoringMode,
        'competitorType' => $competitorType,
        'competitorIds' => $competitorIds,
        'plays' => [],
    ];

    mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use ($tournament) {
        $nameConflict = tournamentNameConflict($tournaments, $tournament['name']);
        if ($nameConflict === 'active') {
            respond(400, ['error' => 'Tournament already exists.']);
        }
        if ($nameConflict === 'previous') {
            respond(400, ['error' => 'Tournament Name used previously.']);
        }
        $tournaments[] = $tournament;
        return $tournaments;
    });
    respond(201, normalizeTournamentForResponse($tournament));
}

if ($method === 'PUT') {
    $body = readBody();

    // Update a play on an active tournament.
    if (isset($body['tournamentId']) && isset($body['playId'])) {
        $tournamentId = trim((string) $body['tournamentId']);
        $playId = trim((string) $body['playId']);
        $gameId = isset($body['gameId']) ? trim((string) $body['gameId']) : '';
        if ($tournamentId === '') {
            respond(400, ['error' => 'tournamentId is required']);
        }
        if ($playId === '') {
            respond(400, ['error' => 'playId is required']);
        }
        if ($gameId === '') {
            respond(400, ['error' => 'gameId is required']);
        }

        $validGames = loadIdSet($gamesFile, 'Corrupt games.json');
        if (!isset($validGames[$gameId])) {
            respond(400, ['error' => 'Unknown game id']);
        }

        $hasWinners = bodyHasWinners($body);
        $hasPlacements = bodyHasPlacements($body);
        $winnerIds = parseWinnerIdsFromBody($body);
        $placementIds = parsePlacementIdsFromBody($body);
        $updatedPlay = null;

        mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use (
            $tournamentId,
            $playId,
            $gameId,
            $hasWinners,
            $hasPlacements,
            $winnerIds,
            $placementIds,
            &$updatedPlay
        ) {
            $index = findTournamentIndex($tournaments, $tournamentId);
            if ($index < 0) {
                respond(404, ['error' => 'Tournament not found']);
            }

            $tournament = $tournaments[$index];
            if (normalizeStatus($tournament['status'] ?? 'active') !== 'active') {
                respond(400, ['error' => 'Games can only be edited on active tournaments']);
            }

            $scoringMode = normalizeScoringMode($tournament['scoringMode'] ?? 'gameWins');
            $competitorType = normalizeCompetitorType($tournament['competitorType'] ?? 'player');
            if ($scoringMode === 'points') {
                if ($hasWinners) {
                    respond(400, ['error' => 'This tournament uses points scoring; send placementIds']);
                }
                $resultIds = $placementIds;
            } else {
                if ($hasPlacements) {
                    respond(400, ['error' => 'This tournament uses game wins; send winnerIds']);
                }
                $resultIds = $winnerIds;
            }

            $roster = rosterIdsFromTournament($tournament);
            if ($scoringMode === 'points') {
                validatePlacementIds($resultIds, $roster, $competitorType);
            } else {
                validateWinnerIds($resultIds, $roster, $competitorType);
            }

            $plays = getPlays($tournament);
            $foundPlay = false;
            foreach ($plays as $p => $play) {
                if (($play['id'] ?? '') === $playId) {
                    $plays[$p] = formatPlayForStorage($playId, $gameId, $scoringMode, $resultIds);
                    $updatedPlay = $plays[$p];
                    $foundPlay = true;
                    break;
                }
            }

            if (!$foundPlay) {
                respond(404, ['error' => 'Play not found']);
            }

            $tournaments[$index]['plays'] = $plays;
            return $tournaments;
        });
        respond(200, formatPlayForResponse($updatedPlay));
    }

    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $updated = null;
    mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use (
        $id,
        $name,
        $body,
        $playersFile,
        $teamsFile,
        &$updated
    ) {
        $nameConflict = tournamentNameConflict($tournaments, $name, $id);
        if ($nameConflict === 'active') {
            respond(400, ['error' => 'Tournament already exists.']);
        }
        if ($nameConflict === 'previous') {
            respond(400, ['error' => 'Tournament Name used previously.']);
        }

        $found = false;
        foreach ($tournaments as $i => $tournament) {
            if (($tournament['id'] ?? '') === $id) {
                $currentStatus = normalizeStatus($tournament['status'] ?? 'active');
                $newStatus = normalizeStatus($body['status'] ?? $currentStatus);
                $existingCompetitorIds = rosterIdsFromTournament($tournament);
                $existingCompetitorType = normalizeCompetitorType($tournament['competitorType'] ?? 'player');
                $existingScoringMode = normalizeScoringMode($tournament['scoringMode'] ?? 'gameWins');
                $plays = getPlays($tournament);

                if (array_key_exists('competitorType', $body)) {
                    $incomingType = normalizeCompetitorType($body['competitorType']);
                    if ($incomingType !== $existingCompetitorType && count($plays) > 0) {
                        respond(400, ['error' => 'Competitor type cannot be changed after games are recorded']);
                    }
                    $competitorType = $incomingType;
                } else {
                    $competitorType = $existingCompetitorType;
                }

                if (array_key_exists('scoringMode', $body)) {
                    $incomingMode = normalizeScoringMode($body['scoringMode']);
                    if ($incomingMode !== $existingScoringMode && count($plays) > 0) {
                        respond(400, ['error' => 'Scoring mode cannot be changed after games are recorded']);
                    }
                    $scoringMode = $incomingMode;
                } else {
                    $scoringMode = $existingScoringMode;
                }

                $rawCompetitorIds = competitorIdsFromBody($body);
                $label = $competitorType === 'team' ? 'team' : 'player';

                if ($currentStatus === 'ended') {
                    if ($rawCompetitorIds !== null) {
                        $incoming = normalizeCompetitorIds($rawCompetitorIds, $competitorType, $playersFile, $teamsFile, false);
                        sort($incoming);
                        $compareExisting = $existingCompetitorIds;
                        sort($compareExisting);
                        if ($incoming !== $compareExisting) {
                            respond(400, ['error' => ucfirst($label) . 's cannot be changed after a tournament has ended']);
                        }
                    }
                    $competitorIds = $existingCompetitorIds;
                } else {
                    $competitorIds = $rawCompetitorIds !== null
                        ? normalizeCompetitorIds($rawCompetitorIds, $competitorType, $playersFile, $teamsFile, true)
                        : $existingCompetitorIds;
                    if (count($competitorIds) === 0) {
                        respond(400, ['error' => 'At least one ' . $label . ' is required']);
                    }
                }

                $tournaments[$i]['name'] = $name;
                $tournaments[$i]['date'] = normalizeDate($body['date'] ?? ($tournament['date'] ?? ''));
                $tournaments[$i]['status'] = $newStatus;
                $tournaments[$i]['scoringMode'] = $scoringMode;
                $tournaments[$i]['competitorType'] = $competitorType;
                $tournaments[$i]['competitorIds'] = $competitorIds;
                unset($tournaments[$i]['playerIds']);
                $tournaments[$i]['plays'] = $plays;
                $found = true;
                $updated = normalizeTournamentForResponse($tournaments[$i]);
                break;
            }
        }

        if (!$found) {
            respond(404, ['error' => 'Tournament not found']);
        }

        return $tournaments;
    });
    respond(200, $updated);
}

if ($method === 'DELETE') {
    $body = readBody();

    // Delete a play from an active tournament.
    $tournamentId = isset($body['tournamentId']) ? trim((string) $body['tournamentId']) : '';
    $playId = isset($body['playId']) ? trim((string) $body['playId']) : '';
    if ($tournamentId !== '' && $playId !== '') {
        mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use ($tournamentId, $playId) {
            $index = findTournamentIndex($tournaments, $tournamentId);
            if ($index < 0) {
                respond(404, ['error' => 'Tournament not found']);
            }

            if (normalizeStatus($tournaments[$index]['status'] ?? 'active') !== 'active') {
                respond(400, ['error' => 'Games can only be removed from active tournaments']);
            }

            $plays = getPlays($tournaments[$index]);
            $before = count($plays);
            $plays = array_values(array_filter($plays, static function ($play) use ($playId) {
                return (($play['id'] ?? '') !== $playId);
            }));

            if (count($plays) === $before) {
                respond(404, ['error' => 'Play not found']);
            }

            $tournaments[$index]['plays'] = $plays;
            return $tournaments;
        });
        respond(200, ['ok' => true, 'playId' => $playId]);
    }

    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '' && isset($_GET['id'])) {
        $id = (string) $_GET['id'];
    }
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    mutateJsonArray($dataFile, 'Corrupt tournaments.json', static function (array $tournaments) use ($id) {
        $before = count($tournaments);
        $tournaments = array_values(array_filter($tournaments, static function ($tournament) use ($id) {
            return ($tournament['id'] ?? '') !== $id;
        }));

        if (count($tournaments) === $before) {
            respond(404, ['error' => 'Tournament not found']);
        }

        return $tournaments;
    });
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
