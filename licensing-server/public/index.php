<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/LicenseService.php';
require_once __DIR__ . '/../src/JsonResponse.php';
require_once __DIR__ . '/../src/Config.php';

const MAX_BODY_BYTES = 16384;

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: POST');
        JsonResponse::error('method_not_allowed', 'Only POST is allowed', 405);
    }
    $requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
    $action = ApiRequestSecurity::resolveRoute(is_string($requestPath) ? $requestPath : '/');
    $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
    if ($contentType !== 'application/json') {
        JsonResponse::error('unsupported_media_type', 'Content-Type must be application/json', 415);
    }
    $declaredLength = filter_var($_SERVER['CONTENT_LENGTH'] ?? null, FILTER_VALIDATE_INT);
    if ($declaredLength !== false && $declaredLength !== null && $declaredLength > MAX_BODY_BYTES) {
        JsonResponse::error('payload_too_large', 'Request body is too large', 413);
    }
    $body = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($body === false || strlen($body) > MAX_BODY_BYTES) {
        JsonResponse::error('payload_too_large', 'Request body is too large', 413);
    }
    $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($input) || ($input !== [] && array_keys($input) === range(0, count($input) - 1))) {
        throw new LicenseInputError();
    }

    $config = Config::load();
    if (in_array($action, ['deactivate', 'renew-status'], true)) {
        ApiRequestSecurity::requireAdmin(
            (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? ''),
            (string) ($config['admin_api_token'] ?? getenv('LICENSING_ADMIN_API_TOKEN') ?: '')
        );
    }

    $privateKeyPath = $config['private_key_path'] ?? getenv('LICENSING_PRIVATE_KEY_PATH');
    if (!is_string($privateKeyPath) || $privateKeyPath === '') {
        throw new RuntimeException('Signing key is not configured');
    }
    $privateKey = file_get_contents($privateKeyPath);
    if ($privateKey === false) {
        throw new RuntimeException('Signing key cannot be read');
    }
    $repository = new PdoLicenseRepository(Database::connect($config['database'] ?? []));
    if (in_array($action, ['activate', 'validate'], true)) {
        $rate = $config['rate_limit'] ?? [];
        $limit = $rate['limit'] ?? 60;
        $window = $rate['window_seconds'] ?? 60;
        if (!is_int($limit) || $limit < 1 || !is_int($window) || $window < 1) {
            throw new RuntimeException('Rate limit configuration is invalid');
        }
        $pepper = (string) ($config['rate_limit_pepper'] ?? getenv('LICENSING_RATE_LIMIT_PEPPER') ?: '');
        $clientKey = ApiRequestSecurity::clientKey((string) ($_SERVER['REMOTE_ADDR'] ?? ''), $pepper);
        $now = (new DateTimeImmutable('now', new DateTimeZone('UTC')))->format('Y-m-d\TH:i:s\Z');
        if (!$repository->consumeRateLimit($action, $clientKey, $limit, $window, $now)) {
            throw new LicenseProblem('rate_limited', 'Too many requests', 429);
        }
    }
    $service = new LicenseService($repository, $privateKey);
    $context = ['ip' => (string) ($_SERVER['REMOTE_ADDR'] ?? '')];
    $result = match ($action) {
        'activate' => $service->activate($input, $context),
        'validate' => $service->validate($input, $context),
        'deactivate' => $service->deactivate($input, $context),
        'renew-status' => $service->renewStatus($input),
        default => throw new LicenseProblem('not_found', 'Endpoint not found', 404),
    };
    JsonResponse::success($result);
} catch (LicenseProblem $error) {
    JsonResponse::error($error->publicCode, $error->getMessage(), $error->httpStatus);
} catch (JsonException) {
    JsonResponse::error('invalid_json', 'Request body must be valid JSON', 400);
} catch (Throwable $error) {
    $correlation = bin2hex(random_bytes(8));
    error_log("Licensing API failure [{$correlation}] " . get_class($error));
    JsonResponse::error('internal_error', 'An internal error occurred', 500);
}
