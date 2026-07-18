<?php
/**
 * Tournaments API — CRUD against ../data/tournaments.json
 * Plays: POST { tournamentId, gameId, winnerPlayerIds? }
 *        PUT  { tournamentId, playId, gameId, winnerPlayerIds? }
 *        DELETE { tournamentId, playId }
 * winnerPlayerIds accepts up to 4 unique roster player ids per play.
 * Legacy winnerPlayerId (single string) is still accepted on POST/PUT.
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tournaments.json';
$playersFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';
$gamesFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'games.json';

function respond(int $status, $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    exit;
}

function readBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(400, ['error' => 'Invalid JSON body']);
    }
    return $decoded;
}

function loadJsonArray(string $path, string $corruptMessage): array
{
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
        $raw = substr($raw, 3);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(500, ['error' => $corruptMessage]);
    }
    return $decoded;
}

function loadTournaments(string $path): array
{
    return loadJsonArray($path, 'Corrupt tournaments.json');
}

function saveTournaments(string $path, array $tournaments): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $fp = fopen($path, 'c+');
    if ($fp === false) {
        respond(500, ['error' => 'Unable to open tournaments.json']);
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(500, ['error' => 'Unable to lock tournaments.json']);
    }

    ftruncate($fp, 0);
    rewind($fp);
    $json = json_encode(array_values($tournaments), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || fwrite($fp, $json . "\n") === false) {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(500, ['error' => 'Unable to write tournaments.json']);
    }

    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
}

function newId(): string
{
    if (function_exists('random_bytes')) {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12)
        );
    }
    return uniqid('tournament_', true);
}

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

function normalizePlayerIds($value, string $playersPath, bool $required): array
{
    if ($value === null) {
        $value = [];
    }
    if (!is_array($value)) {
        respond(400, ['error' => 'playerIds must be an array']);
    }

    $validIds = loadIdSet($playersPath, 'Corrupt players.json');
    $playerIds = [];
    $seen = [];

    foreach ($value as $id) {
        $id = trim((string) $id);
        if ($id === '' || isset($seen[$id])) {
            continue;
        }
        if (!isset($validIds[$id])) {
            respond(400, ['error' => 'Unknown player id: ' . $id]);
        }
        $seen[$id] = true;
        $playerIds[] = $id;
    }

    if ($required && count($playerIds) === 0) {
        respond(400, ['error' => 'At least one player is required']);
    }

    return $playerIds;
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

const MAX_WINNERS_PER_PLAY = 4;

function normalizePlayWinners(array $play): array
{
    if (isset($play['winnerPlayerIds']) && is_array($play['winnerPlayerIds'])) {
        $ids = [];
        $seen = [];
        foreach ($play['winnerPlayerIds'] as $id) {
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

    $single = isset($play['winnerPlayerId']) ? trim((string) $play['winnerPlayerId']) : '';
    return $single !== '' ? [$single] : [];
}

function parseWinnerPlayerIdsFromBody(array $body): array
{
    if (isset($body['winnerPlayerIds'])) {
        if (!is_array($body['winnerPlayerIds'])) {
            respond(400, ['error' => 'winnerPlayerIds must be an array']);
        }
        $ids = [];
        $seen = [];
        foreach ($body['winnerPlayerIds'] as $id) {
            $id = trim((string) $id);
            if ($id === '' || isset($seen[$id])) {
                continue;
            }
            $seen[$id] = true;
            $ids[] = $id;
        }
        return $ids;
    }

    $winnerPlayerId = isset($body['winnerPlayerId']) ? trim((string) $body['winnerPlayerId']) : '';
    return $winnerPlayerId !== '' ? [$winnerPlayerId] : [];
}

function validateWinnerPlayerIds(array $winnerPlayerIds, array $roster): void
{
    if (count($winnerPlayerIds) > MAX_WINNERS_PER_PLAY) {
        respond(400, ['error' => 'A game can have at most ' . MAX_WINNERS_PER_PLAY . ' winners']);
    }

    $seen = [];
    foreach ($winnerPlayerIds as $id) {
        if (isset($seen[$id])) {
            respond(400, ['error' => 'Duplicate winner is not allowed']);
        }
        $seen[$id] = true;
        if (!in_array($id, $roster, true)) {
            respond(400, ['error' => 'Winner must be a player in the tournament']);
        }
    }
}

function formatPlayForStorage(string $playId, string $gameId, array $winnerPlayerIds): array
{
    return [
        'id' => $playId,
        'gameId' => $gameId,
        'winnerPlayerIds' => array_values($winnerPlayerIds),
    ];
}

function formatPlayForResponse(array $play): array
{
    return [
        'id' => (string) ($play['id'] ?? ''),
        'gameId' => (string) ($play['gameId'] ?? ''),
        'winnerPlayerIds' => normalizePlayWinners($play),
    ];
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
    return $tournament;
}

$method = $_SERVER['REQUEST_METHOD'];
$tournaments = loadTournaments($dataFile);

if ($method === 'GET') {
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
        $index = findTournamentIndex($tournaments, $tournamentId);
        if ($index < 0) {
            respond(404, ['error' => 'Tournament not found']);
        }

        $tournament = $tournaments[$index];
        if (normalizeStatus($tournament['status'] ?? 'active') !== 'active') {
            respond(400, ['error' => 'Games can only be added to active tournaments']);
        }

        $validGames = loadIdSet($gamesFile, 'Corrupt games.json');
        if (!isset($validGames[$gameId])) {
            respond(400, ['error' => 'Unknown game id']);
        }

        $roster = isset($tournament['playerIds']) && is_array($tournament['playerIds'])
            ? array_map('strval', $tournament['playerIds'])
            : [];
        $winnerPlayerIds = parseWinnerPlayerIdsFromBody($body);
        validateWinnerPlayerIds($winnerPlayerIds, $roster);

        $play = formatPlayForStorage(newId(), $gameId, $winnerPlayerIds);
        $plays = getPlays($tournament);
        $plays[] = $play;
        $tournaments[$index]['plays'] = $plays;
        if (!isset($tournaments[$index]['playerIds'])) {
            $tournaments[$index]['playerIds'] = $roster;
        }

        saveTournaments($dataFile, $tournaments);
        respond(201, formatPlayForResponse($play));
    }

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $status = normalizeStatus($body['status'] ?? 'active');
    $playerIds = normalizePlayerIds($body['playerIds'] ?? [], $playersFile, true);

    $tournament = [
        'id' => newId(),
        'name' => $name,
        'date' => normalizeDate($body['date'] ?? ''),
        'status' => $status,
        'playerIds' => $playerIds,
        'plays' => [],
    ];
    $tournaments[] = $tournament;
    saveTournaments($dataFile, $tournaments);
    respond(201, $tournament);
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

        $index = findTournamentIndex($tournaments, $tournamentId);
        if ($index < 0) {
            respond(404, ['error' => 'Tournament not found']);
        }

        $tournament = $tournaments[$index];
        if (normalizeStatus($tournament['status'] ?? 'active') !== 'active') {
            respond(400, ['error' => 'Games can only be edited on active tournaments']);
        }

        $validGames = loadIdSet($gamesFile, 'Corrupt games.json');
        if (!isset($validGames[$gameId])) {
            respond(400, ['error' => 'Unknown game id']);
        }

        $roster = isset($tournament['playerIds']) && is_array($tournament['playerIds'])
            ? array_map('strval', $tournament['playerIds'])
            : [];
        $winnerPlayerIds = parseWinnerPlayerIdsFromBody($body);
        validateWinnerPlayerIds($winnerPlayerIds, $roster);

        $plays = getPlays($tournament);
        $foundPlay = false;
        $updatedPlay = null;
        foreach ($plays as $p => $play) {
            if (($play['id'] ?? '') === $playId) {
                $plays[$p] = formatPlayForStorage($playId, $gameId, $winnerPlayerIds);
                $updatedPlay = $plays[$p];
                $foundPlay = true;
                break;
            }
        }

        if (!$foundPlay) {
            respond(404, ['error' => 'Play not found']);
        }

        $tournaments[$index]['plays'] = $plays;
        saveTournaments($dataFile, $tournaments);
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

    $found = false;
    foreach ($tournaments as $i => $tournament) {
        if (($tournament['id'] ?? '') === $id) {
            $currentStatus = normalizeStatus($tournament['status'] ?? 'active');
            $newStatus = normalizeStatus($body['status'] ?? $currentStatus);
            $existingPlayerIds = isset($tournament['playerIds']) && is_array($tournament['playerIds'])
                ? array_values(array_map('strval', $tournament['playerIds']))
                : [];

            if ($currentStatus === 'ended') {
                if (array_key_exists('playerIds', $body)) {
                    $incoming = normalizePlayerIds($body['playerIds'], $playersFile, false);
                    sort($incoming);
                    $compareExisting = $existingPlayerIds;
                    sort($compareExisting);
                    if ($incoming !== $compareExisting) {
                        respond(400, ['error' => 'Players cannot be changed after a tournament has ended']);
                    }
                }
                $playerIds = $existingPlayerIds;
            } else {
                $playerIds = array_key_exists('playerIds', $body)
                    ? normalizePlayerIds($body['playerIds'], $playersFile, true)
                    : $existingPlayerIds;
                if (count($playerIds) === 0) {
                    respond(400, ['error' => 'At least one player is required']);
                }
            }

            $tournaments[$i]['name'] = $name;
            $tournaments[$i]['date'] = normalizeDate($body['date'] ?? ($tournament['date'] ?? ''));
            $tournaments[$i]['status'] = $newStatus;
            $tournaments[$i]['playerIds'] = $playerIds;
            $tournaments[$i]['plays'] = getPlays($tournament);
            $found = true;
            $updated = $tournaments[$i];
            break;
        }
    }

    if (!$found) {
        respond(404, ['error' => 'Tournament not found']);
    }

    saveTournaments($dataFile, $tournaments);
    respond(200, $updated);
}

if ($method === 'DELETE') {
    $body = readBody();

    // Delete a play from an active tournament.
    $tournamentId = isset($body['tournamentId']) ? trim((string) $body['tournamentId']) : '';
    $playId = isset($body['playId']) ? trim((string) $body['playId']) : '';
    if ($tournamentId !== '' && $playId !== '') {
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
        saveTournaments($dataFile, $tournaments);
        respond(200, ['ok' => true, 'playId' => $playId]);
    }

    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '' && isset($_GET['id'])) {
        $id = (string) $_GET['id'];
    }
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    $before = count($tournaments);
    $tournaments = array_values(array_filter($tournaments, static function ($tournament) use ($id) {
        return ($tournament['id'] ?? '') !== $id;
    }));

    if (count($tournaments) === $before) {
        respond(404, ['error' => 'Tournament not found']);
    }

    saveTournaments($dataFile, $tournaments);
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
