<?php
/**
 * Players API — CRUD against ../data/players.json
 */

require_once __DIR__ . '/_lib.php';
sendCorsHeaders();

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';
$cornholeFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'cornhole-tournaments.json';
$tournamentsFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'tournaments.json';
$teamsFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'teams.json';

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

function activeCornholeTournamentNamesForPlayer(string $cornholePath, string $playerId): array
{
    if (!is_file($cornholePath)) {
        return [];
    }
    $rows = json_decode((string) file_get_contents($cornholePath), true);
    if (!is_array($rows)) {
        return [];
    }

    $names = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        $status = strtoupper(trim((string) ($row['status'] ?? '')));
        if ($status !== 'ACTIVE' && $status !== 'SETUP') {
            continue;
        }

        $referenced = false;
        foreach ($row['teams'] ?? [] as $team) {
            if (!is_array($team)) {
                continue;
            }
            if ((string) ($team['player1Id'] ?? '') === $playerId || (string) ($team['player2Id'] ?? '') === $playerId) {
                $referenced = true;
                break;
            }
        }
        if (!$referenced && is_array($row['playerPoolIds'] ?? null)) {
            foreach ($row['playerPoolIds'] as $poolId) {
                if ((string) $poolId === $playerId) {
                    $referenced = true;
                    break;
                }
            }
        }
        if ($referenced) {
            $names[] = trim((string) ($row['name'] ?? 'Cornhole tournament'));
        }
    }

    return array_values(array_unique($names));
}

function rosterIdsFromTournamentRow(array $tournament): array
{
    if (isset($tournament['competitorIds']) && is_array($tournament['competitorIds'])) {
        return array_values(array_map('strval', $tournament['competitorIds']));
    }
    if (isset($tournament['playerIds']) && is_array($tournament['playerIds'])) {
        return array_values(array_map('strval', $tournament['playerIds']));
    }
    return [];
}

function activeTournamentNamesForPlayer(string $tournamentsPath, string $teamsPath, string $playerId): array
{
    if (!is_file($tournamentsPath)) {
        return [];
    }
    $rows = json_decode((string) file_get_contents($tournamentsPath), true);
    if (!is_array($rows)) {
        return [];
    }

    $teamRows = is_file($teamsPath)
        ? json_decode((string) file_get_contents($teamsPath), true)
        : [];
    $teamsById = [];
    if (is_array($teamRows)) {
        foreach ($teamRows as $team) {
            if (!is_array($team)) {
                continue;
            }
            $teamId = trim((string) ($team['id'] ?? ''));
            if ($teamId !== '') {
                $teamsById[$teamId] = $team;
            }
        }
    }

    $names = [];
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }
        if (strtolower(trim((string) ($row['status'] ?? ''))) !== 'active') {
            continue;
        }

        $competitorIds = rosterIdsFromTournamentRow($row);
        $competitorType = strtolower(trim((string) ($row['competitorType'] ?? 'player')));
        $referenced = false;

        if ($competitorType === 'team' || $competitorType === 'teams') {
            foreach ($competitorIds as $teamId) {
                $team = $teamsById[$teamId] ?? null;
                if (!is_array($team)) {
                    continue;
                }
                foreach ($team['playerIds'] ?? [] as $memberId) {
                    if ((string) $memberId === $playerId) {
                        $referenced = true;
                        break 2;
                    }
                }
            }
        } elseif (in_array($playerId, $competitorIds, true)) {
            $referenced = true;
        }

        if ($referenced) {
            $names[] = trim((string) ($row['name'] ?? 'Tournament'));
        }
    }

    return array_values(array_unique($names));
}

function playerDeleteBlockers(string $playerId, string $cornholePath, string $tournamentsPath, string $teamsPath): array
{
    $blockers = [];
    foreach (activeCornholeTournamentNamesForPlayer($cornholePath, $playerId) as $name) {
        $blockers[] = 'Cornhole: ' . $name;
    }
    foreach (activeTournamentNamesForPlayer($tournamentsPath, $teamsPath, $playerId) as $name) {
        $blockers[] = 'Tournament: ' . $name;
    }
    return $blockers;
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

    $blockers = playerDeleteBlockers($id, $cornholeFile, $tournamentsFile, $teamsFile);
    if ($blockers !== []) {
        respond(409, [
            'error' => 'Cannot delete this player while they are in an active tournament: '
                . implode('; ', $blockers)
                . '. End or finish the tournament first.',
        ]);
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
