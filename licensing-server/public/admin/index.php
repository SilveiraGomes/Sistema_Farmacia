<?php
declare(strict_types=1);

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/../../src/AdminAuth.php';
require_once __DIR__ . '/../../src/AdminService.php';
require_once __DIR__ . '/../../src/Config.php';

function bootstrapAdmin(): array {
    $config = Config::load();
    AdminAuth::startSession($config['admin_session'] ?? []);
    $pdo = Database::connect($config['database'] ?? []);
    return [$pdo, new AdminService(new PdoAdminRepository($pdo))];
}
try {
    [$pdo, $service] = bootstrapAdmin();
} catch (Throwable $error) {
    $correlation = bin2hex(random_bytes(8));
    error_log("Admin bootstrap failure [{$correlation}] " . get_class($error));
    http_response_code(503);
    header('Content-Type: text/html; charset=UTF-8');
    echo '<!doctype html><html lang="pt"><meta charset="utf-8"><title>Serviço indisponível</title>'
        . '<h1>Serviço temporariamente indisponível</h1><p>Referência: '
        . htmlspecialchars($correlation, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8')
        . '</p></html>';
    exit;
}
$path = trim((string)($_GET['page'] ?? 'licenses'));
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$admin = $_SESSION['admin'] ?? null;
if(is_array($admin)){
    $admin=AdminAuth::currentUser($pdo,$_SESSION);
    if($admin===null)redirectAdmin('login');
}
$csrf = AdminAuth::csrfToken($_SESSION);

function h(mixed $v): string { return htmlspecialchars((string)$v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function redirectAdmin(string $page): never { header('Location: index.php?page='.rawurlencode($page), true, 303); exit; }
function requireAction(array $admin, string $action): void {
    if (!AdminAuth::can((string)($admin['role'] ?? ''), $action)) throw new RuntimeException('Ação não autorizada');
}
function actor(array $admin): array { return $admin + ['ip'=>(string)($_SERVER['REMOTE_ADDR'] ?? '')]; }
function flashKey(string $key, string $csrf): string {
    $iv=random_bytes(12); $tag=''; $cipher=openssl_encrypt($key,'aes-256-gcm',hash('sha256',$csrf,true),OPENSSL_RAW_DATA,$iv,$tag);
    return base64_encode($iv.$tag.$cipher);
}
function revealKey(string $value, string $csrf): string {
    $raw=base64_decode($value,true); if($raw===false||strlen($raw)<29)return '';
    return (string)openssl_decrypt(substr($raw,28),'aes-256-gcm',hash('sha256',$csrf,true),OPENSSL_RAW_DATA,substr($raw,0,12),substr($raw,12,16));
}

try {
    if ($method === 'POST') {
        if (!AdminRequest::mutationHasValidCsrf($method, $_POST, $_SESSION)) throw new RuntimeException('Pedido expirado (CSRF)');
        $action=(string)($_POST['action'] ?? '');
        if ($action === 'login') {
            if (!AdminAuth::login($pdo, trim((string)($_POST['identity']??'')), (string)($_POST['password']??''), $_SESSION, null, (string)($_SERVER['REMOTE_ADDR']??''))) $_SESSION['error']='Credenciais inválidas ou acesso temporariamente bloqueado';
            redirectAdmin('licenses');
        }
        if (!is_array($admin)) redirectAdmin('login');
        if ($action === 'logout') { AdminAuth::logout($_SESSION); header('Location: index.php?page=login',true,303); exit; }
        if ($action === 'customer') { requireAction($admin,'customer'); $service->createCustomer($_POST); $_SESSION['message']='Cliente cadastrado.'; redirectAdmin('customers'); }
        if ($action === 'issue') { requireAction($admin,'issue'); $result=$service->issue((int)$_POST['customer_id'],(string)$_POST['plan'],actor($admin)); $_SESSION['issued_key']=flashKey($result['licenseKey'],$csrf); redirectAdmin('issued'); }
        if ($action === 'renew') { requireAction($admin,'renew'); $service->renew((int)$_POST['license_id'],(string)$_POST['plan'],actor($admin)); $_SESSION['message']='Licença renovada.'; redirectAdmin('licenses'); }
        if ($action === 'block' || $action === 'revoke') { requireAction($admin,$action); $service->setStatus((int)$_POST['license_id'],$action==='block'?'blocked':'revoked',actor($admin)); $_SESSION['message']='Estado atualizado.'; redirectAdmin('licenses'); }
        if ($action === 'transfer') { requireAction($admin,'transfer'); $service->transfer((int)$_POST['license_id'],actor($admin)); $_SESSION['message']='Vínculo anterior desativado.'; redirectAdmin('licenses'); }
        throw new RuntimeException('Ação inválida');
    }
} catch (Throwable $e) {
    $correlation=bin2hex(random_bytes(8));
    error_log("Admin panel failure [{$correlation}] ".get_class($e));
    $template=AdminRequest::publicError($e);
    $_SESSION['error']=str_contains($template,'%s')?sprintf($template,$correlation):$template;
    redirectAdmin(is_array($admin)?$path:'login');
}

if (!is_array($admin) && $path !== 'login') redirectAdmin('login');
$message=$_SESSION['message']??null; $error=$_SESSION['error']??null; unset($_SESSION['message'],$_SESSION['error']);
?><!doctype html><html lang="pt"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Administração de Licenças</title>
<style>body{font:15px system-ui;margin:0;background:#f4f7f6;color:#172522}header{background:#123c33;color:#fff;padding:16px 5%;display:flex;justify-content:space-between}main{max-width:1100px;margin:28px auto;padding:0 20px}.card{background:#fff;padding:22px;border-radius:10px;box-shadow:0 2px 12px #0001;margin-bottom:18px}nav a{color:#fff;margin-right:18px}input,select,textarea,button{padding:10px;border:1px solid #ccd6d3;border-radius:6px;margin:4px}button{background:#176b55;color:#fff;cursor:pointer}.danger{background:#9b2c2c}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e4e9e7}.msg{padding:12px;background:#dff5e9}.err{padding:12px;background:#ffe0e0}.key{font:18px monospace;word-break:break-all;background:#eef4f2;padding:16px}</style></head><body>
<?php if(is_array($admin)): ?><header><nav><a href="?page=licenses">Licenças</a><a href="?page=customers">Clientes</a><a href="?page=issue">Emitir</a></nav><form method="post"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><input type="hidden" name="action" value="logout"><button>Sair (<?=h($admin['username'])?>)</button></form></header><?php endif ?>
<main><?php if($message):?><p class="msg"><?=h($message)?></p><?php endif?><?php if($error):?><p class="err"><?=h($error)?></p><?php endif?>
<?php if($path==='login'): ?><section class="card"><h1>Acesso administrativo</h1><form method="post"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><input type="hidden" name="action" value="login"><input name="identity" placeholder="Utilizador ou e-mail" required><input type="password" name="password" placeholder="Palavra-passe" required><button>Entrar</button></form></section>
<?php elseif($path==='customers'): $rows=$service->customers((string)($_GET['q']??'')); ?><section class="card"><h1>Clientes</h1><form method="get"><input type="hidden" name="page" value="customers"><input name="q" value="<?=h($_GET['q']??'')?>" placeholder="Pesquisar"><button>Pesquisar</button></form><table><tr><th>Nome</th><th>NIF</th><th>Contacto</th></tr><?php foreach($rows as $r):?><tr><td><?=h($r['name'])?></td><td><?=h($r['tax_id'])?></td><td><?=h($r['email'].' '.$r['phone'])?></td></tr><?php endforeach?></table></section>
<?php if(AdminAuth::can($admin['role'],'customer')):?><section class="card"><h2>Novo cliente</h2><form method="post"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><input type="hidden" name="action" value="customer"><input name="name" placeholder="Nome" required><input name="tax_id" placeholder="NIF"><input type="email" name="email" placeholder="E-mail"><input name="phone" placeholder="Telefone"><textarea name="notes" placeholder="Notas"></textarea><button>Cadastrar</button></form></section><?php endif?>
<?php elseif($path==='issue'): $customers=$service->customers(); ?><section class="card"><h1>Emitir licença</h1><?php if(empty($customers)):?><p class="err">Nenhum cliente cadastrado. <a href="?page=customers">Cadastre um cliente</a> antes de emitir.</p><?php else:?><form method="post"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><input type="hidden" name="action" value="issue"><select name="customer_id" required><?php foreach($customers as $c):?><option value="<?=h($c['id'])?>"><?=h($c['name'])?></option><?php endforeach?></select><select name="plan"><option value="demo">Demo — 30 dias</option><option value="one_year">1 ano</option><option value="two_years">2 anos</option><option value="three_years">3 anos</option></select><button>Emitir</button></form><?php endif?></section>
<?php elseif($path==='issued'): $enc=$_SESSION['issued_key']??'';unset($_SESSION['issued_key']);$key=revealKey((string)$enc,$csrf);?><section class="card"><h1>Licença emitida</h1><p>Copie agora. Esta chave não voltará a ser exibida.</p><div class="key"><?=h($key)?></div></section>
<?php elseif($path==='history'): $licenseId=(int)($_GET['license_id']??0);$offset=max(0,(int)($_GET['offset']??0));$rows=$service->events($licenseId,50,$offset);?><section class="card"><h1>Histórico da licença #<?=h($licenseId)?></h1><table><tr><th>Data</th><th>Tipo</th><th>Ator / IP</th><th>Detalhes</th></tr><?php foreach($rows as$r):?><tr><td><?=h($r['created_at'])?></td><td><?=h($r['event_type'])?></td><td><?=h(($r['actor_reference']?:$r['actor_type']).' / '.$r['ip_address'])?></td><td><pre><?=h($r['details'])?></pre></td></tr><?php endforeach?></table><p><?php if($offset>0):?><a href="?page=history&amp;license_id=<?=h($licenseId)?>&amp;offset=<?=h(max(0,$offset-50))?>">Anterior</a><?php endif?> <?php if(count($rows)===50):?><a href="?page=history&amp;license_id=<?=h($licenseId)?>&amp;offset=<?=h($offset+50)?>">Seguinte</a><?php endif?></p></section>
<?php else: $rows=$service->licenses((string)($_GET['q']??''));?><section class="card"><h1>Licenças</h1><form method="get"><input type="hidden" name="page" value="licenses"><input name="q" value="<?=h($_GET['q']??'')?>" placeholder="Cliente, ID ou estado"><button>Pesquisar</button></form><table><tr><th>Cliente</th><th>Plano/estado</th><th>Validade</th><th>Máquina</th><th>Ações</th></tr><?php foreach($rows as$r):?><tr><td><?=h($r['customer_name'])?><br><small><?=h($r['public_id'])?></small></td><td><?=h($r['plan'].' / '.$r['status'])?></td><td><?=h($r['expires_at'])?></td><td><?=h($r['machine_hash']?'vinculada':'livre')?></td><td><a href="?page=history&amp;license_id=<?=h($r['id'])?>">Histórico</a> <?php foreach(['renew','transfer','block','revoke'] as$a):if(!AdminAuth::can($admin['role'],$a))continue;if($a==='renew'&&$r['plan']==='demo')continue;?><form method="post" style="display:inline"><input type="hidden" name="csrf" value="<?=h($csrf)?>"><input type="hidden" name="action" value="<?=h($a)?>"><input type="hidden" name="license_id" value="<?=h($r['id'])?>"><?php if($a==='renew'):?><select name="plan"><option value="one_year">+1 ano</option><option value="two_years">+2 anos</option><option value="three_years">+3 anos</option></select><?php endif?><button class="<?=in_array($a,['block','revoke'],true)?'danger':''?>"><?=h($a)?></button></form><?php endforeach?></td></tr><?php endforeach?></table></section><?php endif?></main></body></html>
