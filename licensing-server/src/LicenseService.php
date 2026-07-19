<?php

declare(strict_types=1);

require_once __DIR__ . '/LicenseSigner.php';
require_once __DIR__ . '/LicensePolicy.php';
require_once __DIR__ . '/AuditSanitizer.php';

interface LicenseRepository
{
    public function transaction(callable $operation): mixed;
    public function lockLicense(string $keyHash): ?array;
    public function lockDemoClaim(string $machineHash): ?array;
    public function claimDemo(int $licenseId, string $machineHash): void;
    public function activeActivation(int $licenseId): ?array;
    public function activationByInstallation(int $licenseId, string $installationId): ?array;
    public function createActivation(int $licenseId, string $machineHash, string $installationId, string $now): array;
    public function touchActivation(int $activationId, string $now): void;
    public function deactivateActivation(int $activationId, string $now): void;
    public function setLicensePeriod(int $licenseId, string $startsAt, string $expiresAt): void;
    public function setLicenseStatus(int $licenseId, string $status): void;
    public function addEvent(int $licenseId, ?int $activationId, string $type, array $context, array $details): void;
    public function consumeRateLimit(string $action, string $clientKey, int $limit, int $windowSeconds, string $now): bool;
}

class LicenseProblem extends RuntimeException
{
    public function __construct(public string $publicCode, string $message, public int $httpStatus)
    {
        parent::__construct($message);
    }
}

final class LicenseInputError extends LicenseProblem
{
    public function __construct(string $code = 'invalid_request', string $message = 'Invalid request')
    {
        parent::__construct($code, $message, 422);
    }
}

final class LicenseDenied extends LicenseProblem
{
    public function __construct(string $code)
    {
        parent::__construct($code, 'License is not available', 403);
    }
}

final class LicenseConflict extends LicenseProblem
{
    public function __construct(string $code)
    {
        parent::__construct($code, 'License cannot be used on this installation', 409);
    }
}

final class LicenseService
{
    private $clock;
    private $signer;

    public function __construct(
        private LicenseRepository $repository,
        private string $privateKey,
        ?callable $clock = null,
        ?callable $signer = null
    ) {
        $this->clock = $clock ?? static fn (): DateTimeImmutable => new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $this->signer = $signer ?? [LicenseSigner::class, 'sign'];
    }

    public function activate(array $input, array $context = []): array
    {
        [$key, $machineHash, $installation] = $this->activationInput($input);
        $decision = $this->repository->transaction(function () use ($key, $machineHash, $installation, $context): array {
            $now = ($this->clock)()->setTimezone(new DateTimeZone('UTC'));
            $license = $this->requireLicense($key);
            $denial = $this->checkUsable($license, $now);
            if ($denial !== null) {
                return ['denial' => $denial];
            }
            $active = $this->repository->activeActivation((int) $license['id']);
            if ($active !== null) {
                if (
                    hash_equals($active['machine_hash'], $machineHash)
                    && hash_equals($active['installation_id'], $installation)
                ) {
                    $this->repository->touchActivation((int) $active['id'], $this->date($now));
                    return $this->response($license, $active, $now);
                }
                throw new LicenseConflict('MACHINE_LIMIT');
            }

            if ($license['plan'] === 'demo') {
                $claim = $this->repository->lockDemoClaim($machineHash);
                if ($claim !== null && (int) $claim['license_id'] !== (int) $license['id']) {
                    throw new LicenseConflict('DEMO_ALREADY_USED');
                }
                if ($license['starts_at'] === null) {
                    $this->repository->claimDemo((int) $license['id'], $machineHash);
                } elseif ($claim === null) {
                    throw new LicenseConflict('DEMO_ALREADY_USED');
                }
            }

            if ($license['starts_at'] === null) {
                $expires = $now->add($this->duration((string) $license['plan']));
                $this->repository->setLicensePeriod((int) $license['id'], $this->sqlDate($now), $this->sqlDate($expires));
                $license['status'] = 'active';
                $license['starts_at'] = $this->date($now);
                $license['expires_at'] = $this->date($expires);
            }
            $activation = $this->repository->createActivation(
                (int) $license['id'],
                $machineHash,
                $installation,
                $this->date($now)
            );
            $this->repository->addEvent(
                (int) $license['id'],
                (int) $activation['id'],
                'activated',
                $this->safeContext($context),
                ['machineHash' => $machineHash, 'installationId' => $installation]
            );
            return $this->response($license, $activation, $now);
        });
        if (isset($decision['denial'])) {
            throw new LicenseDenied($decision['denial']);
        }
        return $decision;
    }

    public function validate(array $input, array $context = []): array
    {
        [$key, $machineHash, $installation] = $this->activationInput($input);
        $decision = $this->repository->transaction(function () use ($key, $machineHash, $installation, $context): array {
            $now = ($this->clock)()->setTimezone(new DateTimeZone('UTC'));
            $license = $this->requireLicense($key);
            $denial = $this->checkUsable($license, $now);
            if ($denial !== null) {
                return ['denial' => $denial];
            }
            $activation = $this->repository->activationByInstallation((int) $license['id'], $installation);
            if (
                $activation === null
                || $activation['status'] !== 'active'
                || !hash_equals($activation['machine_hash'], $machineHash)
            ) {
                throw new LicenseDenied('activation_not_found');
            }
            $this->repository->touchActivation((int) $activation['id'], $this->date($now));
            $this->repository->addEvent((int) $license['id'], (int) $activation['id'], 'validated', $this->safeContext($context), []);
            return $this->response($license, $activation, $now);
        });
        if (isset($decision['denial'])) {
            throw new LicenseDenied($decision['denial']);
        }
        return $decision;
    }

    public function deactivate(array $input, array $context = []): array
    {
        [$key, $machineHash, $installation] = $this->activationInput($input);
        return $this->repository->transaction(function () use ($key, $machineHash, $installation, $context): array {
            $now = ($this->clock)()->setTimezone(new DateTimeZone('UTC'));
            $license = $this->requireLicense($key);
            $activation = $this->repository->activationByInstallation((int) $license['id'], $installation);
            if ($activation === null || $activation['status'] !== 'active' || !hash_equals($activation['machine_hash'], $machineHash)) {
                throw new LicenseDenied('activation_not_found');
            }
            $this->repository->deactivateActivation((int) $activation['id'], $this->date($now));
            $this->repository->addEvent((int) $license['id'], (int) $activation['id'], 'deactivated', $this->safeContext($context), []);
            return ['deactivated' => true];
        });
    }

    public function renewStatus(array $input): array
    {
        $key = $this->text($input, 'licenseKey', 256);
        return $this->repository->transaction(function () use ($key): array {
            $license = $this->requireLicense($key);
            $now = ($this->clock)()->setTimezone(new DateTimeZone('UTC'));
            $expired = $license['expires_at'] !== null && new DateTimeImmutable($license['expires_at'], new DateTimeZone('UTC')) <= $now;
            return [
                'renewable' => LicensePolicy::isRenewable($license),
                'plan' => $license['plan'],
                'status' => $expired ? 'expired' : $license['status'],
                'expiresAt' => $license['expires_at'],
            ];
        });
    }

    private function requireLicense(string $key): array
    {
        $normalized = strtoupper(preg_replace('/[^A-Z0-9]/i', '', $key));
        $license = $this->repository->lockLicense(hash('sha256', $normalized));
        if ($license === null) {
            throw new LicenseDenied('license_not_found');
        }
        return $license;
    }

    private function checkUsable(array $license, DateTimeImmutable $now): ?string
    {
        if (in_array($license['status'], ['blocked', 'revoked', 'expired'], true)) {
            throw new LicenseDenied((string) $license['status']);
        }
        if ($license['expires_at'] !== null && new DateTimeImmutable($license['expires_at'], new DateTimeZone('UTC')) <= $now) {
            $this->repository->setLicenseStatus((int) $license['id'], 'expired');
            $this->repository->addEvent((int) $license['id'], null, 'expired', ['actor' => 'system'], []);
            return 'expired';
        }
        return null;
    }

    private function activationInput(array $input): array
    {
        $key = $this->text($input, 'licenseKey', 256);
        $machine = $this->text($input, 'machineId', 512);
        $installation = $this->text($input, 'installationId', 36);
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $installation) !== 1) {
            throw new LicenseInputError('invalid_installation');
        }
        return [$key, hash('sha256', $machine), strtolower($installation)];
    }

    private function text(array $input, string $field, int $limit): string
    {
        if (!isset($input[$field]) || !is_string($input[$field])) {
            throw new LicenseInputError();
        }
        $value = trim($input[$field]);
        if ($value === '' || strlen($value) > $limit || preg_match('/[\x00-\x1F\x7F]/', $value) === 1) {
            throw new LicenseInputError();
        }
        return $value;
    }

    private function duration(string $plan): DateInterval
    {
        try { return LicensePolicy::duration($plan); }
        catch (InvalidArgumentException $e) { throw new RuntimeException('Invalid persisted license plan', 0, $e); }
    }

    private function response(array $license, array $activation, DateTimeImmutable $now): array
    {
        $payload = [
            'version' => 1,
            'licenseId' => (string) $license['public_id'],
            'product' => 'kilsystem-pharmacy',
            'customerId' => (string) $license['customer_id'],
            'issuedAt' => $this->date($now),
            'expiresAt' => $this->date(new DateTimeImmutable((string) $license['expires_at'], new DateTimeZone('UTC'))),
            'features' => [],
            'machineHash' => $activation['machine_hash'],
            'installationId' => $activation['installation_id'],
            'lastValidatedAt' => $this->date($now),
            'nextValidationAt' => $this->nextValidation($now, (string) $license['expires_at']),
            'plan' => (string) $license['plan'],
        ];
        return [
            'valid' => true,
            'license' => ['id' => $license['public_id'], 'plan' => $license['plan'], 'expiresAt' => $license['expires_at']],
            'activation' => ['installationId' => $activation['installation_id']],
            'document' => ($this->signer)($payload, $this->privateKey),
        ];
    }

    private function nextValidation(DateTimeImmutable $now, string $expiresAt): string
    {
        $next = $now->add(new DateInterval('P7D'));
        $expiry = new DateTimeImmutable($expiresAt, new DateTimeZone('UTC'));
        return $this->date($next < $expiry ? $next : $expiry);
    }

    private function date(DateTimeImmutable $date): string
    {
        return $date->format('Y-m-d\TH:i:s\Z');
    }

    private function sqlDate(DateTimeImmutable $date): string
    {
        return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
    }

    private function safeContext(array $context): array
    {
        return ['actor' => 'client', 'ip' => isset($context['ip']) ? substr((string) $context['ip'], 0, 45) : null];
    }
}

final class PdoLicenseRepository implements LicenseRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function transaction(callable $operation): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $result = $operation();
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    public function lockLicense(string $keyHash): ?array
    {
        return $this->one('SELECT * FROM licenses WHERE license_key_hash = ? FOR UPDATE', [$keyHash]);
    }

    public function lockDemoClaim(string $machineHash): ?array
    {
        return $this->one('SELECT * FROM demo_machine_claims WHERE machine_hash = ? FOR UPDATE', [$machineHash]);
    }

    public function claimDemo(int $licenseId, string $machineHash): void
    {
        try {
            $this->execute(
                "INSERT INTO demo_machine_claims (machine_hash, license_id, license_plan) VALUES (?, ?, 'demo')",
                [$machineHash, $licenseId]
            );
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                throw new LicenseConflict('DEMO_ALREADY_USED');
            }
            throw $error;
        }
    }

    public function activeActivation(int $licenseId): ?array
    {
        return $this->one(
            "SELECT * FROM activations WHERE license_id = ? AND status = 'active' FOR UPDATE",
            [$licenseId]
        );
    }

    public function activationByInstallation(int $licenseId, string $installationId): ?array
    {
        return $this->one(
            'SELECT * FROM activations WHERE license_id = ? AND installation_id = ? FOR UPDATE',
            [$licenseId, $installationId]
        );
    }

    public function createActivation(int $licenseId, string $machineHash, string $installationId, string $now): array
    {
        try {
            $this->execute(
                'INSERT INTO activations (license_id, machine_hash, installation_id, activated_at, last_validated_at)
                 VALUES (?, ?, ?, ?, ?)',
                [$licenseId, $machineHash, $installationId, $now, $now]
            );
        } catch (PDOException $error) {
            if ($error->getCode() === '23000') {
                throw new LicenseConflict('MACHINE_LIMIT');
            }
            throw $error;
        }
        return [
            'id' => (int) $this->pdo->lastInsertId(), 'license_id' => $licenseId,
            'machine_hash' => $machineHash, 'installation_id' => $installationId,
            'status' => 'active',
        ];
    }

    public function touchActivation(int $activationId, string $now): void
    {
        $this->execute('UPDATE activations SET last_validated_at = ? WHERE id = ?', [$now, $activationId]);
    }

    public function deactivateActivation(int $activationId, string $now): void
    {
        $this->execute(
            "UPDATE activations SET status = 'deactivated', deactivated_at = ? WHERE id = ? AND status = 'active'",
            [$now, $activationId]
        );
    }

    public function setLicensePeriod(int $licenseId, string $startsAt, string $expiresAt): void
    {
        $this->execute(
            "UPDATE licenses SET status = 'active', starts_at = ?, expires_at = ? WHERE id = ?",
            [$startsAt, $expiresAt, $licenseId]
        );
    }

    public function setLicenseStatus(int $licenseId, string $status): void
    {
        $this->execute('UPDATE licenses SET status = ? WHERE id = ?', [$status, $licenseId]);
    }

    public function addEvent(int $licenseId, ?int $activationId, string $type, array $context, array $details): void
    {
        $this->execute(
            "INSERT INTO license_events
                (license_id, activation_id, event_type, actor_type, actor_reference, ip_address, details)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                $licenseId, $activationId, $type, $context['actor'] ?? 'client',
                $context['reference'] ?? null, $context['ip'] ?? null,
                json_encode(AuditSanitizer::clean($details), JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),
            ]
        );
    }

    public function consumeRateLimit(string $action, string $clientKey, int $limit, int $windowSeconds, string $now): bool
    {
        $startedHere = !$this->pdo->inTransaction();
        if ($startedHere) {
            $this->pdo->beginTransaction();
        }
        try {
            $sqlNow = str_replace(['T', 'Z'], [' ', ''], $now);
            $this->execute(
                'INSERT INTO license_rate_limits (action, client_key, window_started_at, request_count)
                 VALUES (?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    request_count = IF(window_started_at <= DATE_SUB(VALUES(window_started_at), INTERVAL ? SECOND), 1, request_count + 1),
                    window_started_at = IF(window_started_at <= DATE_SUB(VALUES(window_started_at), INTERVAL ? SECOND), VALUES(window_started_at), window_started_at)',
                [$action, $clientKey, $sqlNow, $windowSeconds, $windowSeconds]
            );
            $row = $this->one(
                'SELECT request_count FROM license_rate_limits WHERE action = ? AND client_key = ? FOR UPDATE',
                [$action, $clientKey]
            );
            if ($startedHere) {
                $this->pdo->commit();
            }
            return $row !== null && (int) $row['request_count'] <= $limit;
        } catch (Throwable $error) {
            if ($startedHere && $this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }

    private function one(string $sql, array $parameters): ?array
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return is_array($row) ? $row : null;
    }

    private function execute(string $sql, array $parameters): void
    {
        $statement = $this->pdo->prepare($sql);
        $statement->execute($parameters);
    }
}
