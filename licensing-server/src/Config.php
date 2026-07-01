<?php

declare(strict_types=1);

final class Config
{
    public static function load(?string $path = null): array
    {
        $path ??= getenv('LICENSING_CONFIG_PATH') ?: dirname(__DIR__) . '/config.php';
        $real = realpath($path);
        if ($real === false || !is_file($real) || !is_readable($real)) {
            throw new RuntimeException('Licensing configuration is unavailable');
        }
        $public = realpath(dirname(__DIR__) . '/public');
        if ($public !== false && str_starts_with($real, $public . DIRECTORY_SEPARATOR)) {
            throw new RuntimeException('Licensing configuration must be outside the public directory');
        }
        $config = require $real;
        if (!is_array($config)) {
            throw new RuntimeException('Licensing configuration must return an array');
        }
        foreach (['database', 'private_key_path'] as $required) {
            if (!isset($config[$required]) || $config[$required] === '' || $config[$required] === []) {
                throw new RuntimeException("Missing required configuration: {$required}");
            }
        }
        return $config;
    }
}
