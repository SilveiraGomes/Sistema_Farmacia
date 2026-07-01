<?php

declare(strict_types=1);

final class LicenseSigner
{
    private const MAX_PAYLOAD_BYTES = 16384;

    public static function sign(array $payload, string $privateKey): array
    {
        self::validatePayload($payload);
        $canonicalJson = json_encode(
            self::canonicalize($payload),
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR
        );
        if (strlen($canonicalJson) > self::MAX_PAYLOAD_BYTES) {
            throw new InvalidArgumentException('Payload exceeds size limit');
        }

        $encodedPayload = self::base64UrlEncode($canonicalJson);
        $key = openssl_pkey_get_private($privateKey);
        if ($key === false) {
            throw new InvalidArgumentException('Invalid private key');
        }
        $keyDetails = openssl_pkey_get_details($key);
        if (
            !is_array($keyDetails)
            || $keyDetails['type'] !== OPENSSL_KEYTYPE_RSA
            || !isset($keyDetails['bits'])
            || $keyDetails['bits'] < 2048
        ) {
            throw new InvalidArgumentException('An RSA key of at least 2048 bits is required');
        }
        if (!openssl_sign($encodedPayload, $signature, $key, OPENSSL_ALGO_SHA256)) {
            throw new RuntimeException('Unable to sign license payload');
        }

        return [
            'algorithm' => 'RS256',
            'payload' => $encodedPayload,
            'signature' => self::base64UrlEncode($signature),
        ];
    }

    public static function base64UrlDecode(string $value): string
    {
        if ($value === '' || preg_match('/^[A-Za-z0-9_-]+$/', $value) !== 1) {
            throw new InvalidArgumentException('Invalid Base64URL value');
        }
        if (strlen($value) % 4 === 1) {
            throw new InvalidArgumentException('Invalid Base64URL value');
        }
        $decoded = base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
        if ($decoded === false || self::base64UrlEncode($decoded) !== $value) {
            throw new InvalidArgumentException('Invalid Base64URL value');
        }
        return $decoded;
    }

    private static function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function canonicalize(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        if (self::isList($value)) {
            return array_map([self::class, 'canonicalize'], $value);
        }
        ksort($value, SORT_STRING);
        foreach ($value as $key => $item) {
            $value[$key] = self::canonicalize($item);
        }
        return $value;
    }

    private static function validatePayload(array $payload): void
    {
        $required = [
            'version', 'licenseId', 'product', 'customerId', 'machineHash', 'installationId',
            'issuedAt', 'expiresAt', 'lastValidatedAt', 'nextValidationAt', 'plan', 'features',
        ];
        $keys = array_keys($payload);
        sort($keys, SORT_STRING);
        $expected = $required;
        sort($expected, SORT_STRING);
        if ($keys !== $expected) {
            throw new InvalidArgumentException('Invalid license payload schema');
        }
        if ($payload['version'] !== 1) {
            throw new InvalidArgumentException('Unsupported payload version');
        }
        foreach (['licenseId', 'product', 'customerId'] as $field) {
            if (!is_string($payload[$field]) || $payload[$field] === '' || strlen($payload[$field]) > 512) {
                throw new InvalidArgumentException("Invalid payload field: {$field}");
            }
        }
        if (
            !is_string($payload['machineHash'])
            || preg_match('/^[0-9a-f]{64}$/', $payload['machineHash']) !== 1
        ) {
            throw new InvalidArgumentException('Invalid machineHash');
        }
        if (
            !is_string($payload['installationId'])
            || preg_match(
                '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/',
                $payload['installationId']
            ) !== 1
        ) {
            throw new InvalidArgumentException('Invalid installationId');
        }
        if (
            !is_string($payload['plan'])
            || !in_array($payload['plan'], ['demo', 'one_year', 'two_years', 'three_years'], true)
        ) {
            throw new InvalidArgumentException('Invalid license plan');
        }
        $timestamps = [];
        foreach (['issuedAt', 'expiresAt', 'lastValidatedAt', 'nextValidationAt'] as $field) {
            if (!is_string($payload[$field]) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $payload[$field]) !== 1) {
                throw new InvalidArgumentException("Invalid UTC date: {$field}");
            }
            $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:s\Z', $payload[$field], new DateTimeZone('UTC'));
            $errors = DateTimeImmutable::getLastErrors();
            if (
                $date === false
                || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))
                || $date->format('Y-m-d\TH:i:s\Z') !== $payload[$field]
            ) {
                throw new InvalidArgumentException("Invalid UTC date: {$field}");
            }
            $timestamps[$field] = $date->getTimestamp();
        }
        if (
            $timestamps['issuedAt'] > $timestamps['expiresAt']
            || $timestamps['issuedAt'] > $timestamps['lastValidatedAt']
            || $timestamps['lastValidatedAt'] > $timestamps['nextValidationAt']
            || $timestamps['nextValidationAt'] > $timestamps['expiresAt']
        ) {
            throw new InvalidArgumentException('Invalid license validation chronology');
        }
        if (!is_array($payload['features']) || !self::isList($payload['features'])) {
            throw new InvalidArgumentException('Invalid features field');
        }
        foreach ($payload['features'] as $feature) {
            if (!is_string($feature) || $feature === '' || strlen($feature) > 128) {
                throw new InvalidArgumentException('Invalid feature');
            }
        }
    }

    private static function isList(array $value): bool
    {
        return $value === [] || array_keys($value) === range(0, count($value) - 1);
    }
}
