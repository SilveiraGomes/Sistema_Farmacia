<?php

declare(strict_types=1);

// FICHEIRO DE CONFIGURAÇÃO DE PRODUÇÃO
// Preencher todos os <<<PLACEHOLDER>>> antes de colocar no servidor.
// Nunca commitar este ficheiro (está em .gitignore como licensing-server/config.php).
// Destino no servidor: public_html/.private/licensing-server/config.php

// Para gerar os tokens aleatórios, correr via SSH:
//   openssl rand -hex 32

return [
    // Caminho absoluto para a chave privada RSA no servidor.
    // Substituir <<<SSH_USER>>> pelo utilizador SSH real (ex: u303303855).
    'private_key_path' => '/home/<<<SSH_USER>>>/public_html/.private/licensing-server/var/keys/license-private.pem',

    'database' => [
        'host'     => 'localhost',
        'port'     => 3306,
        'database' => 'u303303855_kil_license',
        'username' => '<<<MYSQL_USER>>>',
        'password' => '<<<MYSQL_PASSWORD>>>',
    ],

    // Token Bearer para endpoints admin (deactivate, renew-status).
    // Gerar: openssl rand -hex 32
    'admin_api_token' => '<<<ADMIN_API_TOKEN>>>',

    // Sal secreto para o rate limiter por IP.
    // Gerar: openssl rand -hex 32
    'rate_limit_pepper' => '<<<RATE_LIMIT_PEPPER>>>',

    'rate_limit' => [
        'limit'          => 60,
        'window_seconds' => 60,
    ],

    'admin_session' => [
        'secure_cookie'    => true,   // HTTPS obrigatório — não alterar
        'idle_seconds'     => 1800,
        'absolute_seconds' => 28800,
        'rotate_seconds'   => 900,
    ],
];
