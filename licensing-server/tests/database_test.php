<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Database.php';

final class FakePDO extends PDO
{
    public function __construct()
    {
    }
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . "\nExpected: " . var_export($expected, true)
            . "\nActual: " . var_export($actual, true)
        );
    }
}

function assertThrows(callable $operation, string $expectedMessage): void
{
    try {
        $operation();
    } catch (InvalidArgumentException $exception) {
        assertSameValue($expectedMessage, $exception->getMessage(), 'Unexpected validation error');
        return;
    }

    throw new RuntimeException('Expected InvalidArgumentException was not thrown');
}

function assertContainsText(string $needle, string $haystack, string $message): void
{
    if (!str_contains($haystack, $needle)) {
        throw new RuntimeException($message . "\nMissing: {$needle}");
    }
}

$config = [
    'host' => 'db.example.test',
    'port' => 3307,
    'database' => 'licensing',
    'username' => 'licensing_user',
    'password' => 'secret-for-test-only',
];

$captured = null;
$pdo = Database::connect(
    $config,
    static function (string $dsn, string $username, string $password, array $options) use (&$captured): PDO {
        $captured = compact('dsn', 'username', 'password', 'options');
        return new FakePDO();
    }
);

assertSameValue(FakePDO::class, $pdo::class, 'Database must return the connector result');
assertSameValue(
    'mysql:host=db.example.test;port=3307;dbname=licensing;charset=utf8mb4',
    $captured['dsn'],
    'Database must build a UTF8MB4 MySQL DSN'
);
assertSameValue('licensing_user', $captured['username'], 'Database must pass the username');
assertSameValue('secret-for-test-only', $captured['password'], 'Database must pass the password');
assertSameValue(PDO::ERRMODE_EXCEPTION, $captured['options'][PDO::ATTR_ERRMODE], 'PDO errors must throw');
assertSameValue(PDO::FETCH_ASSOC, $captured['options'][PDO::ATTR_DEFAULT_FETCH_MODE], 'Rows must be associative');
assertSameValue(false, $captured['options'][PDO::ATTR_EMULATE_PREPARES], 'Native prepares must be used');

assertThrows(
    static fn (): PDO => Database::connect(array_diff_key($config, ['host' => true])),
    'Missing database configuration: host'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['port' => 70000])),
    'Invalid database configuration: port must be between 1 and 65535'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['database' => 'bad;name'])),
    'Invalid database configuration: database contains unsupported characters'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['port' => '3306abc'])),
    'Invalid database configuration: port must be between 1 and 65535'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['username' => '  '])),
    'Missing database configuration: username'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['password' => ''])),
    'Missing database configuration: password'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['host' => ['localhost']])),
    'Missing database configuration: host'
);
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, ['username' => "user\nname"])),
    'Invalid database configuration: username contains control characters'
);

$schema = file_get_contents(__DIR__ . '/../schema.sql');
if ($schema === false) {
    throw new RuntimeException('Could not read schema.sql');
}

assertContainsText('CREATE TABLE demo_machine_claims', $schema, 'Schema must persist demo claims');
assertContainsText(
    'UNIQUE KEY uq_demo_machine_claims_machine (machine_hash)',
    $schema,
    'Machine hash must claim a demo only once, including under concurrent requests'
);
assertContainsText(
    "status ENUM('pending', 'active', 'blocked', 'expired', 'revoked')",
    $schema,
    'Licenses must support blocked status'
);
assertContainsText(
    "WHEN status = 'active' THEN license_id",
    $schema,
    'Active activation uniqueness must derive only from status'
);
assertContainsText('ON UPDATE RESTRICT ON DELETE RESTRICT', $schema, 'Audit relationships must restrict deletion');
assertSameValue(false, str_contains($schema, 'ON DELETE CASCADE'), 'Schema must not destroy audit history');

$exampleConfig = file_get_contents(__DIR__ . '/../config.example.php');
if ($exampleConfig === false) {
    throw new RuntimeException('Could not read config.example.php');
}
assertSameValue(false, str_contains($exampleConfig, 'replace-me'), 'Example password must fail closed');
assertContainsText(
    'UNIQUE KEY uq_licenses_id_plan (id, plan)',
    $schema,
    'Licenses must expose a composite candidate key for demo claims'
);
assertContainsText(
    'FOREIGN KEY (license_id, license_plan) REFERENCES licenses (id, plan)',
    $schema,
    'Demo claims must enforce the demo plan through a composite foreign key'
);
assertContainsText(
    "license_plan ENUM('demo', 'one_year', 'two_years', 'three_years') NOT NULL DEFAULT 'demo'",
    $schema,
    'Demo claim discriminator must match the referenced ENUM type'
);
assertContainsText(
    "CHECK (license_plan = 'demo')",
    $schema,
    'A demo claim must only carry the demo plan discriminator'
);

$previousPort = getenv('LICENSING_DB_PORT');
putenv('LICENSING_DB_PORT=3306abc');
try {
    /** @var array{database: array<string, mixed>} $loadedExample */
    $loadedExample = require __DIR__ . '/../config.example.php';
} finally {
    if ($previousPort === false) {
        putenv('LICENSING_DB_PORT');
    } else {
        putenv('LICENSING_DB_PORT=' . $previousPort);
    }
}
assertSameValue('3306abc', $loadedExample['database']['port'], 'Example config must preserve the raw port');
assertThrows(
    static fn (): PDO => Database::connect(array_replace($config, [
        'port' => $loadedExample['database']['port'],
    ])),
    'Invalid database configuration: port must be between 1 and 65535'
);

$previousPort = getenv('LICENSING_DB_PORT');
putenv('LICENSING_DB_PORT=3306');
try {
    /** @var array{database: array<string, mixed>} $numericPortExample */
    $numericPortExample = require __DIR__ . '/../config.example.php';
} finally {
    if ($previousPort === false) {
        putenv('LICENSING_DB_PORT');
    } else {
        putenv('LICENSING_DB_PORT=' . $previousPort);
    }
}
assertSameValue(3306, $numericPortExample['database']['port'], 'Numeric environment port must become int');
$numericPortCapture = null;
Database::connect(
    array_replace($config, ['port' => $numericPortExample['database']['port']]),
    static function (string $dsn, string $username, string $password, array $options) use (
        &$numericPortCapture
    ): PDO {
        $numericPortCapture = $dsn;
        return new FakePDO();
    }
);
assertSameValue(
    'mysql:host=db.example.test;port=3306;dbname=licensing;charset=utf8mb4',
    $numericPortCapture,
    'Validated numeric environment port must reach the connector DSN'
);

echo "database_test: OK\n";
