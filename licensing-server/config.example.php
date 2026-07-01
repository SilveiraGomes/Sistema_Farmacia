<?php

declare(strict_types=1);

$environmentPort = getenv('LICENSING_DB_PORT');
$validatedPort = $environmentPort === false
    ? 3306
    : filter_var($environmentPort, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => 65535],
    ]);
$databasePort = $validatedPort === false ? $environmentPort : (int) $validatedPort;

return [
    'database' => [
        'host' => getenv('LICENSING_DB_HOST') ?: 'localhost',
        'port' => $databasePort,
        'database' => getenv('LICENSING_DB_NAME') ?: 'licensing',
        'username' => getenv('LICENSING_DB_USER') ?: 'licensing_user',
        // Intentionally empty by default: Database::connect rejects missing credentials.
        'password' => getenv('LICENSING_DB_PASSWORD') ?: '',
    ],
];
