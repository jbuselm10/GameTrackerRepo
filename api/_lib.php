<?php
/**
 * Shared API helpers for GameTracker JSON endpoints.
 * Include only — not a public endpoint.
 */

if (basename((string) ($_SERVER['SCRIPT_FILENAME'] ?? '')) === basename(__FILE__)) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

/** @var resource[] */
$GLOBALS['_gt_json_locks'] = [];

function sendCorsHeaders(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

function releaseJsonLocks(): void
{
    foreach ($GLOBALS['_gt_json_locks'] as $fp) {
        if (is_resource($fp)) {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
    $GLOBALS['_gt_json_locks'] = [];
}

function respond(int $status, $payload): void
{
    releaseJsonLocks();
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

function newId(string $fallbackPrefix = 'id_'): string
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
    return uniqid($fallbackPrefix, true);
}

function decodeJsonArrayFromString(string $raw, string $corruptMessage): array
{
    if (trim($raw) === '') {
        return [];
    }
    // Strip UTF-8 BOM if present (common on Windows editors).
    if (strncmp($raw, "\xEF\xBB\xBF", 3) === 0) {
        $raw = substr($raw, 3);
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(500, ['error' => $corruptMessage]);
    }
    return $decoded;
}

function loadJsonArray(string $path, string $corruptMessage): array
{
    if (!file_exists($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return [];
    }
    return decodeJsonArrayFromString($raw, $corruptMessage);
}

/**
 * Read current JSON array contents from an already-locked file handle.
 */
function readJsonArrayFromHandle($fp, string $corruptMessage): array
{
    rewind($fp);
    $raw = stream_get_contents($fp);
    if ($raw === false) {
        respond(500, ['error' => 'Unable to read data file']);
    }
    return decodeJsonArrayFromString($raw, $corruptMessage);
}

/**
 * Write a JSON array to an already-locked file handle.
 */
function writeJsonArrayToHandle($fp, array $items, string $writeErrorMessage): void
{
    ftruncate($fp, 0);
    rewind($fp);
    $json = json_encode(array_values($items), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false || fwrite($fp, $json . "\n") === false) {
        respond(500, ['error' => $writeErrorMessage]);
    }
    fflush($fp);
}

/**
 * Exclusive lock for the full read-modify-write cycle.
 *
 * $mutator receives the current items array and must return the new items array.
 * Early respond() calls inside $mutator release the lock before exiting.
 *
 * @param callable(array): array $mutator
 */
function mutateJsonArray(string $path, string $corruptMessage, callable $mutator): void
{
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }

    $fp = fopen($path, 'c+');
    if ($fp === false) {
        respond(500, ['error' => 'Unable to open data file']);
    }

    if (!flock($fp, LOCK_EX)) {
        fclose($fp);
        respond(500, ['error' => 'Unable to lock data file']);
    }

    $GLOBALS['_gt_json_locks'][] = $fp;

    try {
        $items = readJsonArrayFromHandle($fp, $corruptMessage);
        $newItems = $mutator($items);
        if (!is_array($newItems)) {
            respond(500, ['error' => 'Mutator must return an array']);
        }
        writeJsonArrayToHandle($fp, $newItems, 'Unable to write data file');
    } finally {
        $locks = &$GLOBALS['_gt_json_locks'];
        $idx = array_search($fp, $locks, true);
        if ($idx !== false) {
            unset($locks[$idx]);
            $locks = array_values($locks);
        }
        if (is_resource($fp)) {
            flock($fp, LOCK_UN);
            fclose($fp);
        }
    }
}
