<?php
/**
 * Players API — CRUD against ../data/players.json
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$dataFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'players.json';

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

function loadPlayers(string $path): array
{
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(500, ['error' => 'Corrupt players.json']);
    }
    return $decoded;
}

function savePlayers(string $path, array $players): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $fp = fopen($path, 'c+');
    if ($fp === false) {
        respond(500, ['error' => 'Unable to open players.json']);
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(500, ['error' => 'Unable to lock players.json']);
    }

    ftruncate($fp, 0);
    rewind($fp);
    $json = json_encode(array_values($players), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || fwrite($fp, $json . "\n") === false) {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(500, ['error' => 'Unable to write players.json']);
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
    return uniqid('player_', true);
}

function normalizeNickname($value): string
{
    if ($value === null) {
        return '';
    }
    return trim((string) $value);
}

$method = $_SERVER['REQUEST_METHOD'];
$players = loadPlayers($dataFile);

if ($method === 'GET') {
    respond(200, $players);
}

if ($method === 'POST') {
    $body = readBody();
    $name = isset($body['name']) ? trim((string) $body['name']) : '';
    if ($name === '') {
        respond(400, ['error' => 'Name is required']);
    }

    $player = [
        'id' => newId(),
        'name' => $name,
        'nickname' => normalizeNickname($body['nickname'] ?? ''),
    ];
    $players[] = $player;
    savePlayers($dataFile, $players);
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

    savePlayers($dataFile, $players);
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

    $before = count($players);
    $players = array_values(array_filter($players, static function ($player) use ($id) {
        return ($player['id'] ?? '') !== $id;
    }));

    if (count($players) === $before) {
        respond(404, ['error' => 'Player not found']);
    }

    savePlayers($dataFile, $players);
    respond(200, ['ok' => true, 'id' => $id]);
}

respond(405, ['error' => 'Method not allowed']);
