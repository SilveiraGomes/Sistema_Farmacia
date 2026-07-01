<?php

declare(strict_types=1);

final class Database
{
    /**
     * @param array<string, mixed> $config
     * @param null|callable(string, string, string, array<int, mixed>): PDO $connector
     */
    public static function connect(array $config, ?callable $connector = null): PDO
    {
        foreach (['host', 'database', 'username', 'password'] as $key) {
            if (!array_key_exists($key, $config) || !is_string($config[$key]) || trim($config[$key]) === '') {
                throw new InvalidArgumentException("Missing database configuration: {$key}");
            }
        }

        $port = $config['port'] ?? 3306;
        if (!is_int($port) || $port < 1 || $port > 65535) {
            throw new InvalidArgumentException(
                'Invalid database configuration: port must be between 1 and 65535'
            );
        }

        foreach (['host', 'database'] as $key) {
            if (preg_match('/[;=\x00-\x1F]/', $config[$key]) === 1) {
                throw new InvalidArgumentException(
                    "Invalid database configuration: {$key} contains unsupported characters"
                );
            }
        }

        foreach (['host', 'database', 'username', 'password'] as $key) {
            if (preg_match('/[\x00-\x1F\x7F]/', $config[$key]) === 1) {
                throw new InvalidArgumentException(
                    "Invalid database configuration: {$key} contains control characters"
                );
            }
        }

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $config['host'],
            $port,
            $config['database']
        );
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $connector ??= static fn (
            string $dsn,
            string $username,
            string $password,
            array $options
        ): PDO => new PDO($dsn, $username, $password, $options);

        return $connector($dsn, $config['username'], $config['password'], $options);
    }
}
