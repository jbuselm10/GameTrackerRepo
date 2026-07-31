<?php
/**
 * Teams API — CRUD against ../data/teams.json
 * Team: { id, name, playerIds[] }
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'teams.json';
$playersFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';

function loadPlayerIdSet(string $playersPath): array
{
    $rows = loadJsonArray($playersPath, 'Corrupt players.json');
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

function teamNameTaken(array $teams, string $name, string $excludeId = ''): bool
{
    $needle = strtolower(trim($name));
    if ($needle === '') {
        return false;
    }
    foreach ($teams as $team) {
        if (!is_array($team)) {
            continue;
        }
        $id = isset($team['id']) ? (string) $team['id'] : '';
        if ($excludeId !== '' && $id === $excludeId) {
            continue;
        }
        $existing = strtolower(trim((string) ($team['name'] ?? '')));
        if ($existing === $needle) {
            return true;
        }
    }
    return false;
}

function normalizeTeamPlayerIds($value, string $playersPath, bool $required): array
{
    if ($value === null) {
        $value = [];
    }
    if (!is_array($value)) {
        respond(400, ['error' => 'playerIds must be an array']);
    }

    $validIds = loadPlayerIdSet($playersPath);
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

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    respond(200, loadJsonArray($dataFile, 'Corrupt teams.json'));
}

if ($method === 'POST') {
    $body = readBody();
    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $playerIds = normalizeTeamPlayerIds($body['playerIds'] ?? [], $playersFile, true);

    $team = [
        'id' => newId('team_'),
        'name' => $name,
        'playerIds' => $playerIds,
    ];

    mutateJsonArray($dataFile, 'Corrupt teams.json', static function (array $teams) use ($team) {
        if (teamNameTaken($teams, $team['name'])) {
            respond(400, ['error' => 'This Name has been taken']);
        }
        $teams[] = $team;
        return $teams;
    });
    respond(201, $team);
}

if ($method === 'PUT') {
    $body = readBody();
    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $updated = null;
    mutateJsonArray($dataFile, 'Corrupt teams.json', static function (array $teams) use (
        $id,
        $name,
        $body,
        $playersFile,
        &$updated
    ) {
        if (teamNameTaken($teams, $name, $id)) {
            respond(400, ['error' => 'This Name has been taken']);
        }

        $found = false;
        foreach ($teams as $i => $team) {
            if (($team['id'] ?? '') === $id) {
                $playerIds = array_key_exists('playerIds', $body)
                    ? normalizeTeamPlayerIds($body['playerIds'], $playersFile, true)
                    : (isset($team['playerIds']) && is_array($team['playerIds'])
                        ? array_values(array_map('strval', $team['playerIds']))
                        : []);
                if (count($playerIds) === 0) {
                    respond(400, ['error' => 'At least one player is required']);
                }

                $teams[$i]['name'] = $name;
                $teams[$i]['playerIds'] = $playerIds;
                $found = true;
                $updated = $teams[$i];
                break;
            }
        }

        if (!$found) {
            respond(404, ['error' => 'Team not found']);
        }

        return $teams;
    });
    respond(200, $updated);
}

if ($method === 'DELETE') {
    $body = readBody();
    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '' && isset($_GET['id'])) {
        $id = (string) $_GET['id'];
    }
    if ($id === '') {
        respond(400, ['error' => 'id is required']);
    }

    mutateJsonArray($dataFile, 'Corrupt teams.json', static function (array $teams) use ($id) {
        $before = count($teams);
        $teams = array_values(array_filter($teams, static function ($team) use ($id) {
            return ($team['id'] ?? '') !== $id;
        }));

        if (count($teams) === $before) {
            respond(404, ['error' => 'Team not found']);
        }

        return $teams;
    });
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
