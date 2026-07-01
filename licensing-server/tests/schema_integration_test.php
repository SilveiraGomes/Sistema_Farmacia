<?php

declare(strict_types=1);

$names = [
    'host' => 'LICENSING_TEST_DB_HOST',
    'port' => 'LICENSING_TEST_DB_PORT',
    'username' => 'LICENSING_TEST_DB_USER',
    'password' => 'LICENSING_TEST_DB_PASSWORD',
];
$config = [];
foreach ($names as $key => $environmentName) {
    $value = getenv($environmentName);
    if ($value === false) {
        echo "schema_integration_test: SKIP ({$environmentName} is not set)\n";
        exit(0);
    }
    $config[$key] = $value;
}

if (filter_var($config['port'], FILTER_VALIDATE_INT, [
    'options' => ['min_range' => 1, 'max_range' => 65535],
]) === false) {
    throw new RuntimeException('LICENSING_TEST_DB_PORT must be an integer between 1 and 65535');
}

function expectConstraintFailure(PDO $pdo, string $sql, string $message): void
{
    try {
        $pdo->exec($sql);
    } catch (PDOException) {
        return;
    }

    throw new RuntimeException($message);
}

$databaseName = 'licensing_test_' . bin2hex(random_bytes(8));
$serverDsn = sprintf(
    'mysql:host=%s;port=%d;charset=utf8mb4',
    $config['host'],
    (int) $config['port']
);
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_EMULATE_PREPARES => false,
];
$server = new PDO($serverDsn, $config['username'], $config['password'], $options);

try {
    $server->exec(
        "CREATE DATABASE `{$databaseName}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );
    $pdo = new PDO(
        $serverDsn . ';dbname=' . $databaseName,
        $config['username'],
        $config['password'],
        $options
    );

    $schema = file_get_contents(__DIR__ . '/../schema.sql');
    if ($schema === false) {
        throw new RuntimeException('Could not read schema.sql');
    }
    foreach (preg_split('/;\s*(?:\r?\n|$)/', $schema) ?: [] as $statement) {
        if (trim($statement) !== '') {
            $pdo->exec($statement);
        }
    }

    $pdo->exec("INSERT INTO customers (name) VALUES ('Integration Customer')");
    $customerId = (int) $pdo->lastInsertId();
    $licenseInsert = $pdo->prepare(
        'INSERT INTO licenses (public_id, customer_id, license_key_hash, plan, status)
         VALUES (?, ?, ?, ?, ?)'
    );
    $licenseInsert->execute([
        '00000000-0000-0000-0000-000000000001', $customerId, str_repeat('1', 64), 'demo', 'active',
    ]);
    $demoId = (int) $pdo->lastInsertId();
    $licenseInsert->execute([
        '00000000-0000-0000-0000-000000000002', $customerId, str_repeat('2', 64), 'demo', 'active',
    ]);
    $secondDemoId = (int) $pdo->lastInsertId();
    $licenseInsert->execute([
        '00000000-0000-0000-0000-000000000003', $customerId, str_repeat('3', 64), 'one_year', 'active',
    ]);
    $paidId = (int) $pdo->lastInsertId();

    $machineHash = str_repeat('a', 64);
    $pdo->exec(
        "INSERT INTO demo_machine_claims (machine_hash, license_id, license_plan)
         VALUES ('{$machineHash}', {$demoId}, 'demo')"
    );
    expectConstraintFailure(
        $pdo,
        "INSERT INTO demo_machine_claims (machine_hash, license_id, license_plan)
         VALUES ('{$machineHash}', {$secondDemoId}, 'demo')",
        'A machine claimed a second demo'
    );
    expectConstraintFailure(
        $pdo,
        "INSERT INTO demo_machine_claims (machine_hash, license_id, license_plan)
         VALUES ('" . str_repeat('b', 64) . "', {$paidId}, 'demo')",
        'A paid license was accepted as a demo claim'
    );

    $pdo->exec(
        "INSERT INTO activations (license_id, machine_hash, installation_id)
         VALUES ({$demoId}, '" . str_repeat('c', 64) . "', '10000000-0000-0000-0000-000000000001')"
    );
    expectConstraintFailure(
        $pdo,
        "INSERT INTO activations (license_id, machine_hash, installation_id)
         VALUES ({$demoId}, '" . str_repeat('d', 64) . "', '10000000-0000-0000-0000-000000000002')",
        'A license received a second active activation'
    );
    expectConstraintFailure(
        $pdo,
        "INSERT INTO activations
            (license_id, machine_hash, installation_id, status, deactivated_at)
         VALUES
            ({$secondDemoId}, '" . str_repeat('e', 64) . "',
             '10000000-0000-0000-0000-000000000003', 'deactivated', NULL)",
        'Activation state/date CHECK was not enforced'
    );
    expectConstraintFailure(
        $pdo,
        "DELETE FROM licenses WHERE id = {$demoId}",
        'A referenced license was destructively deleted'
    );

    echo "schema_integration_test: OK\n";
} finally {
    $server->exec("DROP DATABASE IF EXISTS `{$databaseName}`");
}
