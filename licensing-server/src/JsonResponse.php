<?php

declare(strict_types=1);

final class JsonResponse
{
    public static function send(int $status, array $data): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function success(array $data, int $status = 200): void
    {
        self::send($status, ['ok' => true, 'data' => $data]);
    }

    public static function error(string $code, string $message, int $status): void
    {
        self::send($status, ['ok' => false, 'error' => ['code' => $code, 'message' => $message]]);
    }
}

final class ApiRequestSecurity
{
    public static function resolveRoute(string $path): string
    {
        if (preg_match('#^/api/licenses/(activate|validate|deactivate|renew-status)$#', $path, $match) !== 1) {
            throw new LicenseProblem('not_found', 'Endpoint not found', 404);
        }
        return $match[1];
    }

    public static function requireAdmin(string $authorization, string $expectedToken): void
    {
        if ($expectedToken === '' || preg_match('/^Bearer ([^\s]+)$/', $authorization, $match) !== 1) {
            throw new LicenseProblem('unauthorized', 'Authorization required', 401);
        }
        if (!hash_equals($expectedToken, $match[1])) {
            throw new LicenseProblem('unauthorized', 'Authorization required', 401);
        }
    }

    public static function clientKey(string $ip, string $pepper): string
    {
        if ($pepper === '') {
            throw new RuntimeException('Rate limit pepper is not configured');
        }
        return hash_hmac('sha256', $ip, $pepper);
    }
}
