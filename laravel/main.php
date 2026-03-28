<?php
// PHP Laravel — Deploy to Railway
// Setup:
//   composer install
//   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Railway environment variables
//   Railway PHP buildpack serves this file via public/index.php -> symlink or copy
// Local dev:
//   php -S 0.0.0.0:8080 main.php

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$supabaseUrl = getenv('SUPABASE_URL');
$supabaseKey = getenv('SUPABASE_SERVICE_ROLE_KEY');

function sbFetch(string $path, string $method = 'GET', mixed $body = null, string $prefer = ''): mixed
{
    global $supabaseUrl, $supabaseKey;

    $headers = [
        'apikey: ' . $supabaseKey,
        'Authorization: Bearer ' . $supabaseKey,
        'Content-Type: application/json',
    ];
    if ($prefer) {
        $headers[] = 'Prefer: ' . $prefer;
    }

    $ch = curl_init($supabaseUrl . '/rest/v1' . $path);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }
    $result = curl_exec($ch);
    curl_close($ch);
    return json_decode($result, true) ?? [];
}

function jsonResponse(int $status, mixed $data): never
{
    http_response_code($status);
    echo json_encode($data);
    exit;
}

// Parse path: strip /api/laravel prefix
$path   = preg_replace('#^/api/laravel#', '', parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
$method = $_SERVER['REQUEST_METHOD'];
preg_match('#^/todos/([^/]+)$#', $path, $idMatch);

// GET /todos
if ($method === 'GET' && $path === '/todos') {
    $todos = sbFetch('/todos?select=*&order=created_at.desc');
    jsonResponse(200, ['todos' => $todos]);
}

// POST /todos
if ($method === 'POST' && $path === '/todos') {
    $body  = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($body['title'] ?? '');
    if ($title === '') {
        jsonResponse(400, ['error' => 'title is required']);
    }
    $data = sbFetch('/todos', 'POST', ['title' => $title, 'completed' => false], 'return=representation');
    jsonResponse(201, ['todo' => $data[0]]);
}

// PATCH /todos/:id
if ($method === 'PATCH' && $idMatch) {
    $id     = $idMatch[1];
    $body   = json_decode(file_get_contents('php://input'), true) ?? [];
    $update = [];
    if (array_key_exists('title', $body))     $update['title']     = $body['title'];
    if (array_key_exists('completed', $body)) $update['completed'] = $body['completed'];

    $data = sbFetch("/todos?id=eq.{$id}", 'PATCH', $update, 'return=representation');
    if (empty($data)) jsonResponse(404, ['error' => 'todo not found']);
    jsonResponse(200, ['todo' => $data[0]]);
}

// DELETE /todos/:id
if ($method === 'DELETE' && $idMatch) {
    $id       = $idMatch[1];
    $existing = sbFetch("/todos?id=eq.{$id}&select=id");
    if (empty($existing)) jsonResponse(404, ['error' => 'todo not found']);
    sbFetch("/todos?id=eq.{$id}", 'DELETE');
    jsonResponse(200, ['message' => 'deleted']);
}

jsonResponse(404, ['error' => 'not found']);
