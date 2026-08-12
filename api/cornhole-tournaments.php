<?php
/**
 * Cornhole tournaments API — CRUD against ../data/cornhole-tournaments.json
 * Tournament: { id, name, type, teams[], matches[], status, updatedAt }
 * Team: { id, name, player1Id, player2Id, player1Name, player2Name }
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'cornhole-tournaments.json';
$playersFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';

function loadPlayersMap(string $playersPath): array
{
    $rows = loadJsonArray($playersPath, 'Corrupt players.json');
    $map = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $id = isset($row['id']) ? (string) $row['id'] : '';
        if ($id === '') {
            continue;
        }
        $map[$id] = [
            'name' => trim((string) ($row['name'] ?? '')),
            'nickname' => trim((string) ($row['nickname'] ?? '')),
        ];
    }
    return $map;
}

function formatPlayerDisplayName(array $player): string
{
    $name = trim((string) ($player['name'] ?? ''));
    $nickname = trim((string) ($player['nickname'] ?? ''));
    if ($name === '') {
        return $nickname;
    }
    if ($nickname === '') {
        return $name;
    }
    return $name . ' (' . $nickname . ')';
}

function normalizeCornholeType($value): string
{
    $type = strtoupper(trim((string) ($value ?? '')));
    if ($type === 'SINGLE_ELIMINATION' || $type === 'DOUBLE_ELIMINATION') {
        return $type;
    }
    respond(400, ['error' => 'type must be SINGLE_ELIMINATION or DOUBLE_ELIMINATION']);
}

function normalizeCornholeStatus($value): string
{
    $status = strtoupper(trim((string) ($value ?? '')));
    if ($status === '') {
        return 'SETUP';
    }
    if ($status === 'SETUP' || $status === 'ACTIVE' || $status === 'COMPLETED') {
        return $status;
    }
    respond(400, ['error' => 'status must be SETUP, ACTIVE, or COMPLETED']);
}

function normalizeOptionalPlayerId($value, array $playersMap, string $label): string
{
    $id = trim((string) ($value ?? ''));
    if ($id === '') {
        return '';
    }
    if (!isset($playersMap[$id])) {
        respond(400, ['error' => 'Unknown player for ' . $label . ': ' . $id]);
    }
    return $id;
}

function resolvePlayerName(string $playerId, $providedName, array $playersMap): string
{
    if ($playerId === '') {
        return '';
    }
    if (isset($playersMap[$playerId])) {
        return formatPlayerDisplayName($playersMap[$playerId]);
    }
    return trim((string) ($providedName ?? ''));
}

function normalizeCornholeTeams($value, string $playersPath): array
{
    if ($value === null) {
        $value = [];
    }
    if (!is_array($value)) {
        respond(400, ['error' => 'teams must be an array']);
    }

    $count = count($value);
    if ($count < 2 || $count > 20) {
        respond(400, ['error' => 'teams must contain between 2 and 20 teams']);
    }

    $playersMap = loadPlayersMap($playersPath);
    $teams = [];
    $seenPlayers = [];

    foreach ($value as $index => $row) {
        if (!is_array($row)) {
            respond(400, ['error' => 'Each team must be an object']);
        }

        $name = isset($row['name']) ? trim((string) $row['name']) : '';
        if ($name === '') {
            $name = 'Team ' . ($index + 1);
        }

        $player1Id = normalizeOptionalPlayerId($row['player1Id'] ?? '', $playersMap, $name . ' player 1');
        $player2Id = normalizeOptionalPlayerId($row['player2Id'] ?? '', $playersMap, $name . ' player 2');

        if ($player1Id !== '' && isset($seenPlayers[$player1Id])) {
            respond(400, ['error' => 'Player assigned more than once: ' . $player1Id]);
        }
        if ($player2Id !== '' && ($player2Id === $player1Id || isset($seenPlayers[$player2Id]))) {
            respond(400, ['error' => 'Player assigned more than once: ' . $player2Id]);
        }
        if ($player1Id !== '') {
            $seenPlayers[$player1Id] = true;
        }
        if ($player2Id !== '') {
            $seenPlayers[$player2Id] = true;
        }

        $id = isset($row['id']) ? trim((string) $row['id']) : '';
        if ($id === '') {
            $id = newId('cteam_');
        }

        $teams[] = [
            'id' => $id,
            'name' => $name,
            'player1Id' => $player1Id,
            'player2Id' => $player2Id,
            'player1Name' => resolvePlayerName($player1Id, $row['player1Name'] ?? '', $playersMap),
            'player2Name' => resolvePlayerName($player2Id, $row['player2Name'] ?? '', $playersMap),
        ];
    }

    return $teams;
}

function nullableString($value): ?string
{
    if ($value === null) {
        return null;
    }
    $text = trim((string) $value);
    return $text === '' ? null : $text;
}

function normalizeCornholeMatches($value): array
{
    if ($value === null) {
        return [];
    }
    if (!is_array($value)) {
        respond(400, ['error' => 'matches must be an array']);
    }

    $validStatuses = ['PENDING' => true, 'IN_PROGRESS' => true, 'COMPLETED' => true];
    $validBrackets = [
        'WINNERS' => true,
        'LOSERS' => true,
        'GRAND_FINAL' => true,
        'GRAND_FINAL_RESET' => true,
        'THIRD_PLACE' => true,
    ];
    $validSlots = ['team1Id' => true, 'team2Id' => true];
    $matches = [];

    foreach ($value as $row) {
        if (!is_array($row)) {
            respond(400, ['error' => 'Each match must be an object']);
        }

        $id = trim((string) ($row['id'] ?? ''));
        if ($id === '') {
            respond(400, ['error' => 'Each match requires an id']);
        }

        $bracket = strtoupper(trim((string) ($row['bracket'] ?? 'WINNERS')));
        if (!isset($validBrackets[$bracket])) {
            respond(400, ['error' => 'Invalid match bracket: ' . $bracket]);
        }

        $status = strtoupper(trim((string) ($row['status'] ?? 'PENDING')));
        if (!isset($validStatuses[$status])) {
            respond(400, ['error' => 'Invalid match status: ' . $status]);
        }

        $nextSlot = nullableString($row['nextSlot'] ?? null);
        if ($nextSlot !== null) {
            $nextSlot = strtolower($nextSlot) === 'team2id' ? 'team2Id' : (strtolower($nextSlot) === 'team1id' ? 'team1Id' : $nextSlot);
            if (!isset($validSlots[$nextSlot])) {
                $nextSlot = null;
            }
        }
        $loserNextSlot = nullableString($row['loserNextSlot'] ?? null);
        if ($loserNextSlot !== null) {
            $loserNextSlot = strtolower($loserNextSlot) === 'team2id' ? 'team2Id' : (strtolower($loserNextSlot) === 'team1id' ? 'team1Id' : $loserNextSlot);
            if (!isset($validSlots[$loserNextSlot])) {
                $loserNextSlot = null;
            }
        }
        $thirdPlaceSlot = nullableString($row['thirdPlaceSlot'] ?? null);
        if ($thirdPlaceSlot !== null) {
            $thirdPlaceSlot = strtolower($thirdPlaceSlot) === 'team2id' ? 'team2Id' : (strtolower($thirdPlaceSlot) === 'team1id' ? 'team1Id' : $thirdPlaceSlot);
            if (!isset($validSlots[$thirdPlaceSlot])) {
                $thirdPlaceSlot = null;
            }
        }

        $active = array_key_exists('active', $row) ? (bool) $row['active'] : true;
        if ($bracket === 'GRAND_FINAL_RESET' && !array_key_exists('active', $row)) {
            $active = false;
        }

        $matches[] = [
            'id' => $id,
            'round' => (int) ($row['round'] ?? 1),
            'matchNumber' => (int) ($row['matchNumber'] ?? 1),
            'bracket' => $bracket,
            'team1Id' => nullableString($row['team1Id'] ?? null),
            'team2Id' => nullableString($row['team2Id'] ?? null),
            'winnerId' => nullableString($row['winnerId'] ?? null),
            'loserId' => nullableString($row['loserId'] ?? null),
            'nextMatchId' => nullableString($row['nextMatchId'] ?? null),
            'loserNextMatchId' => nullableString($row['loserNextMatchId'] ?? null),
            'thirdPlaceMatchId' => nullableString($row['thirdPlaceMatchId'] ?? null),
            'status' => $status,
            'active' => $active,
            'nextSlot' => $nextSlot,
            'loserNextSlot' => $loserNextSlot,
            'thirdPlaceSlot' => $thirdPlaceSlot,
            'losersBye' => !empty($row['losersBye']),
            'byeToNextRound' => !empty($row['byeToNextRound']),
            'roundByeTeamId' => nullableString($row['roundByeTeamId'] ?? null),
        ];
    }

    return $matches;
}

function teamsFingerprint(array $teams): string
{
    $normalized = [];
    foreach ($teams as $team) {
        if (!is_array($team)) {
            continue;
        }
        $normalized[] = [
            'id' => (string) ($team['id'] ?? ''),
            'name' => (string) ($team['name'] ?? ''),
            'player1Id' => (string) ($team['player1Id'] ?? ''),
            'player2Id' => (string) ($team['player2Id'] ?? ''),
        ];
    }
    return json_encode($normalized);
}

function buildCornholeTournament(array $body, ?array $existing = null): array
{
    global $playersFile;

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        $name = $existing['name'] ?? 'Cornhole Tournament';
    }

    $type = array_key_exists('type', $body)
        ? normalizeCornholeType($body['type'])
        : normalizeCornholeType($existing['type'] ?? '');

    $status = array_key_exists('status', $body)
        ? normalizeCornholeStatus($body['status'])
        : normalizeCornholeStatus($existing['status'] ?? 'SETUP');

    $teams = array_key_exists('teams', $body)
        ? normalizeCornholeTeams($body['teams'], $playersFile)
        : (isset($existing['teams']) && is_array($existing['teams'])
            ? normalizeCornholeTeams($existing['teams'], $playersFile)
            : []);

    $matches = array_key_exists('matches', $body)
        ? normalizeCornholeMatches($body['matches'])
        : (isset($existing['matches']) && is_array($existing['matches'])
            ? normalizeCornholeMatches($existing['matches'])
            : []);

    return [
        'id' => $existing['id'] ?? newId('cornhole_'),
        'name' => $name,
        'type' => $type,
        'teams' => $teams,
        'matches' => $matches,
        'status' => $status,
        'updatedAt' => gmdate('c'),
    ];
}

$method = $_SERVER['REQUEST_METHOD'];

/**
 * Keep the current tournament plus at most one previous COMPLETED tournament.
 * Never accumulates unbounded history.
 *
 * @param array $current
 * @param array $existingRows
 * @param string $currentId
 * @return array
 */
function cornholeRowsForPersist(array $current, array $existingRows, string $currentId): array
{
    $status = strtoupper(trim((string) ($current['status'] ?? 'SETUP')));
    $rows = [$current];

    // When the current tournament is completed, it is the only file record.
    // Previous results for UI prepopulate are kept in the browser session.
    if ($status === 'COMPLETED') {
        return $rows;
    }

    $previous = null;
    foreach ($existingRows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $otherId = (string) ($row['id'] ?? '');
        if ($otherId === '' || $otherId === $currentId) {
            continue;
        }
        $otherStatus = strtoupper(trim((string) ($row['status'] ?? '')));
        if ($otherStatus !== 'COMPLETED') {
            continue;
        }
        if (
            $previous === null ||
            strcmp((string) ($row['updatedAt'] ?? ''), (string) ($previous['updatedAt'] ?? '')) > 0
        ) {
            $previous = $row;
        }
    }

    if (is_array($previous)) {
        $rows[] = $previous;
    }

    return $rows;
}

if ($method === 'GET') {
    $rows = loadJsonArray($dataFile, 'Corrupt cornhole-tournaments.json');
    $id = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($id !== '') {
        foreach ($rows as $row) {
            if (is_array($row) && (string) ($row['id'] ?? '') === $id) {
                respond(200, $row);
            }
        }
        respond(404, ['error' => 'Cornhole tournament not found']);
    }
    respond(200, $rows);
}

if ($method === 'POST') {
    $body = readBody();
    $tournament = buildCornholeTournament($body);
    mutateJsonArray($dataFile, 'Corrupt cornhole-tournaments.json', static function (array $rows) use ($tournament) {
        return cornholeRowsForPersist($tournament, $rows, (string) ($tournament['id'] ?? ''));
    });
    respond(201, $tournament);
}

if ($method === 'PUT') {
    $body = readBody();
    $id = isset($body['id']) ? trim((string) $body['id']) : '';
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    $updated = null;
    mutateJsonArray($dataFile, 'Corrupt cornhole-tournaments.json', static function (array $rows) use ($id, $body, $playersFile, &$updated) {
        $found = false;
        $existing = null;
        foreach ($rows as $row) {
            if (!is_array($row) || (string) ($row['id'] ?? '') !== $id) {
                continue;
            }
            $existing = $row;
            $found = true;
            break;
        }
        if (!$found || !is_array($existing)) {
            respond(404, ['error' => 'Cornhole tournament not found']);
        }

        $existingStatus = strtoupper(trim((string) ($existing['status'] ?? 'SETUP')));
        $nextStatus = array_key_exists('status', $body)
            ? normalizeCornholeStatus($body['status'])
            : $existingStatus;

        if ($existingStatus === 'ACTIVE' || $existingStatus === 'COMPLETED') {
            if (array_key_exists('type', $body)) {
                $nextType = normalizeCornholeType($body['type']);
                $prevType = normalizeCornholeType($existing['type'] ?? '');
                if ($nextType !== $prevType) {
                    respond(409, ['error' => 'Tournament setup is locked after the tournament has started.']);
                }
            }
            if (array_key_exists('teams', $body)) {
                $nextTeams = normalizeCornholeTeams($body['teams'], $playersFile);
                $prevTeams = isset($existing['teams']) && is_array($existing['teams'])
                    ? normalizeCornholeTeams($existing['teams'], $playersFile)
                    : [];
                if (teamsFingerprint($nextTeams) !== teamsFingerprint($prevTeams)) {
                    respond(409, ['error' => 'Tournament setup is locked after the tournament has started.']);
                }
            }
        }

        if ($nextStatus === 'ACTIVE' && $existingStatus !== 'ACTIVE') {
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $otherId = (string) ($row['id'] ?? '');
                $otherStatus = strtoupper(trim((string) ($row['status'] ?? '')));
                if ($otherId !== $id && $otherStatus === 'ACTIVE') {
                    $otherName = trim((string) ($row['name'] ?? 'another Cornhole tournament'));
                    respond(409, [
                        'error' => 'Only one Cornhole tournament can be active at a time. Finish or continue "' . $otherName . '" first.',
                    ]);
                }
            }
        }

        $updated = buildCornholeTournament($body, $existing);
        return cornholeRowsForPersist($updated, $rows, $id);
    });
    respond(200, $updated);
}

if ($method === 'DELETE') {
    $body = readBody();
    $id = isset($body['id']) ? trim((string) $body['id']) : '';
    if ($id === '' && isset($_GET['id'])) {
        $id = trim((string) $_GET['id']);
    }
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    mutateJsonArray($dataFile, 'Corrupt cornhole-tournaments.json', static function (array $rows) use ($id) {
        $before = count($rows);
        $rows = array_values(array_filter($rows, static function ($row) use ($id) {
            return !is_array($row) || (string) ($row['id'] ?? '') !== $id;
        }));
        if (count($rows) === $before) {
            respond(404, ['error' => 'Cornhole tournament not found']);
        }
        return $rows;
    });
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
