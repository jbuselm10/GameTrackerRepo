<?php
/**
 * Players API — CRUD against ../data/players.json
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';

function normalizeNickname($value): string
{
    if ($value === null) {
        return '';
    }
    return trim((string) $value);
}

function playerNameExists(array $players, string $name, string $excludeId = ''): bool
{
    $needle = strtolower(trim($name));
    foreach ($players as $player) {
        if (!is_array($player)) {
            continue;
        }
        if ($excludeId !== '' && (string) ($player['id'] ?? '') === $excludeId) {
            continue;
        }
        if (strtolower(trim((string) ($player['name'] ?? ''))) === $needle) {
            return true;
        }
    }
    return false;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    respond(200, loadJsonArray($dataFile, 'Corrupt players.json'));
}

if ($method === 'POST') {
    $body = readBody();
    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $player = [
        'id' => newId('player_'),
        'name' => $name,
        'nickname' => normalizeNickname($body['nickname'] ?? ''),
    ];

    mutateJsonArray($dataFile, 'Corrupt players.json', static function (array $players) use ($player) {
        if (playerNameExists($players, $player['name'])) {
            respond(400, ['error' => 'Player already exists']);
        }
        $players[] = $player;
        return $players;
    });
    respond(201, $player);
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
    mutateJsonArray($dataFile, 'Corrupt players.json', static function (array $players) use ($id, $name, $body, &$updated) {
        if (playerNameExists($players, $name, $id)) {
            respond(400, ['error' => 'Player already exists']);
        }
        $found = false;
        foreach ($players as $i => $player) {
            if (($player['id'] ?? '') === $id) {
                $players[$i]['name'] = $name;
                $players[$i]['nickname'] = normalizeNickname($body['nickname'] ?? ($player['nickname'] ?? ''));
                $found = true;
                $updated = $players[$i];
                break;
            }
        }

        if (!$found) {
            respond(404, ['error' => 'Player not found']);
        }

        return $players;
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

    mutateJsonArray($dataFile, 'Corrupt players.json', static function (array $players) use ($id) {
        $before = count($players);
        $players = array_values(array_filter($players, static function ($player) use ($id) {
            return ($player['id'] ?? '') !== $id;
        }));

        if (count($players) === $before) {
            respond(404, ['error' => 'Player not found']);
        }

        return $players;
    });
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
