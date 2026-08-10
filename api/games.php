<?php
/**
 * Games API — CRUD against ../data/games.json
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'games.json';

function gameNameExists(array $games, string $name, string $excludeId = ''): bool
{
    $needle = strtolower(trim($name));
    foreach ($games as $game) {
        if (!is_array($game)) {
            continue;
        }
        if ($excludeId !== '' && (string) ($game['id'] ?? '') === $excludeId) {
            continue;
        }
        if (strtolower(trim((string) ($game['name'] ?? ''))) === $needle) {
            return true;
        }
    }
    return false;
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    respond(200, loadJsonArray($dataFile, 'Corrupt games.json'));
}

if ($method === 'POST') {
    $body = readBody();
    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $rules = isset($body['rules']) ? trim((string) $body['rules']) : '';

    $game = [
        'id' => newId('game_'),
        'name' => $name,
        'rules' => $rules,
    ];

    mutateJsonArray($dataFile, 'Corrupt games.json', static function (array $games) use ($game) {
        if (gameNameExists($games, $game['name'])) {
            respond(400, ['error' => 'Game already exists']);
        }
        $games[] = $game;
        return $games;
    });
    respond(201, $game);
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

    $hasRules = array_key_exists('rules', $body);
    $rules = $hasRules ? trim((string) $body['rules']) : null;

    $updated = null;
    mutateJsonArray($dataFile, 'Corrupt games.json', static function (array $games) use ($id, $name, $hasRules, $rules, &$updated) {
        if (gameNameExists($games, $name, $id)) {
            respond(400, ['error' => 'Game already exists']);
        }
        $found = false;
        foreach ($games as $i => $game) {
            if (($game['id'] ?? '') === $id) {
                $games[$i]['name'] = $name;
                if ($hasRules) {
                    $games[$i]['rules'] = $rules;
                } elseif (!array_key_exists('rules', $games[$i])) {
                    $games[$i]['rules'] = '';
                }
                $found = true;
                $updated = $games[$i];
                break;
            }
        }

        if (!$found) {
            respond(404, ['error' => 'Game not found']);
        }

        return $games;
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

    mutateJsonArray($dataFile, 'Corrupt games.json', static function (array $games) use ($id) {
        $before = count($games);
        $games = array_values(array_filter($games, static function ($game) use ($id) {
            return ($game['id'] ?? '') !== $id;
        }));

        if (count($games) === $before) {
            respond(404, ['error' => 'Game not found']);
        }

        return $games;
    });
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
