<?php
declare(strict_types=1);

final class AdminAuth
{
    private const DUMMY_HASH = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.';
    private const POLICY = [
        'viewer' => ['view'],
        'operator' => ['view', 'customer', 'issue', 'renew', 'transfer'],
        'admin' => ['view', 'customer', 'issue', 'renew', 'transfer', 'block', 'revoke'],
    ];

    public static function startSession(array $config = []): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        $secure = self::secureCookieDefault($config);
        session_set_cookie_params([
            'httponly' => true,
            'secure' => $secure,
            'samesite' => 'Strict',
            'path' => '/',
        ]);
        session_start();
        $now=time();
        self::expireAndRenew($_SESSION,$now,$config,static function() use ($secure):void {
            if(session_status()===PHP_SESSION_ACTIVE)session_destroy();
            session_start();
        });
        if (isset($_SESSION['admin'])) {
            $_SESSION['last_seen']=$now;
            if ($now-(int)($_SESSION['rotated_at']??0)>(int)($config['rotate_seconds']??900)) { session_regenerate_id(true); $_SESSION['rotated_at']=$now; }
        }
    }

    public static function login(PDO $pdo, string $identity, string $password, array &$session, ?callable $regenerate=null, string $ip='', ?int $now=null, ?callable $verifier=null): bool
    {
        $now ??= time(); $identity=trim($identity); $attemptKey=hash('sha256',strtolower($identity)."\0".$ip);
        self::cleanupAttempts($pdo,$now);
        self::beginAttemptLock($pdo,$attemptKey,$now);
        try {
            $attempt=self::attempt($pdo,$attemptKey,true);
            if($attempt && self::utcTimestamp($attempt['blocked_until']??null)>$now){self::commitAttemptLock($pdo);return false;}
            $stmt = $pdo->prepare("SELECT id, username, password_hash, role FROM admin_users WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1");
            $stmt->execute([$identity, $identity]);
            $user = $stmt->fetch(PDO::FETCH_ASSOC);
            $hash=is_array($user)?(string)$user['password_hash']:self::DUMMY_HASH;
            $verified=($verifier ?? [self::class,'verifyPassword'])($password,$hash);
            if (!is_array($user) || !$verified) { self::recordFailure($pdo,$attemptKey,$attempt,$now);self::commitAttemptLock($pdo);return false; }
            $pdo->prepare('DELETE FROM admin_login_attempts WHERE attempt_key = ?')->execute([$attemptKey]);
            self::commitAttemptLock($pdo);
        } catch(Throwable $error) {
            self::rollbackAttemptLock($pdo);
            throw $error;
        }
        ($regenerate ?? static fn()=>session_regenerate_id(true))();
        $session['admin'] = ['id'=>(int)$user['id'], 'username'=>(string)$user['username'], 'role'=>(string)$user['role']];
        $session['started_at']=$session['last_seen']=$session['rotated_at']=$now;
        $pdo->prepare('UPDATE admin_users SET last_login_at = UTC_TIMESTAMP() WHERE id = ?')->execute([(int)$user['id']]);
        self::csrfToken($session);
        return true;
    }

    public static function logout(array &$session): void
    {
        $session = [];
        if (session_status() === PHP_SESSION_ACTIVE) {
            setcookie(session_name(), '', ['expires'=>time()-3600, 'path'=>'/', 'httponly'=>true, 'samesite'=>'Strict']);
            session_destroy();
        }
    }

    public static function csrfToken(array &$session): string
    {
        if (!isset($session['csrf']) || !is_string($session['csrf'])) $session['csrf'] = bin2hex(random_bytes(32));
        return $session['csrf'];
    }

    public static function verifyCsrf(array $session, string $token): bool
    {
        return isset($session['csrf']) && is_string($session['csrf']) && hash_equals($session['csrf'], $token);
    }

    public static function can(string $role, string $action): bool
    {
        return in_array($action, self::POLICY[$role] ?? [], true);
    }

    public static function currentUser(PDO $pdo,array &$session):?array {
        $id=(int)($session['admin']['id']??0);
        if($id<1){unset($session['admin']);return null;}
        $s=$pdo->prepare("SELECT id,username,role FROM admin_users WHERE id=? AND status='active' LIMIT 1");
        $s->execute([$id]);$user=$s->fetch(PDO::FETCH_ASSOC);
        if(!is_array($user)){unset($session['admin']);return null;}
        $session['admin']=['id'=>(int)$user['id'],'username'=>(string)$user['username'],'role'=>(string)$user['role']];
        return $session['admin'];
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify($password, $hash);
    }

    public static function secureCookieDefault(array $config):bool { return array_key_exists('secure_cookie',$config)?(bool)$config['secure_cookie']:true; }

    public static function expireAndRenew(array &$session,int $now,array $config,callable $startFresh):bool {
        if(!isset($session['admin']))return false;
        $idle=(int)($config['idle_seconds']??1800);$absolute=(int)($config['absolute_seconds']??28800);
        if($now-(int)($session['last_seen']??$now)<=$idle&&$now-(int)($session['started_at']??$now)<=$absolute)return false;
        $session=[];$startFresh();return true;
    }

    private static function attempt(PDO $pdo,string $key,bool $locked=false):?array {
        $suffix=$locked&&$pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='mysql'?' FOR UPDATE':'';
        $s=$pdo->prepare('SELECT request_count, window_started_at, blocked_until FROM admin_login_attempts WHERE attempt_key = ?'.$suffix);
        $s->execute([$key]);$r=$s->fetch(PDO::FETCH_ASSOC);return is_array($r)?$r:null;
    }
    private static function beginAttemptLock(PDO $pdo,string $key,int $now):void {
        $driver=$pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        if($driver==='sqlite')$pdo->exec('BEGIN IMMEDIATE');
        else $pdo->beginTransaction();
        $stamp=gmdate('Y-m-d H:i:s',$now);
        if($driver==='mysql')$sql='INSERT IGNORE INTO admin_login_attempts (attempt_key,window_started_at,request_count,blocked_until,last_attempt_at) VALUES (?,?,0,NULL,?)';
        elseif($driver==='sqlite')$sql='INSERT OR IGNORE INTO admin_login_attempts (attempt_key,window_started_at,request_count,blocked_until,last_attempt_at) VALUES (?,?,0,NULL,?)';
        else $sql='INSERT INTO admin_login_attempts (attempt_key,window_started_at,request_count,blocked_until,last_attempt_at) VALUES (?,?,0,NULL,?) ON CONFLICT (attempt_key) DO NOTHING';
        $pdo->prepare($sql)->execute([$key,$stamp,$stamp]);
    }
    private static function commitAttemptLock(PDO $pdo):void {
        if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')$pdo->exec('COMMIT');
        else $pdo->commit();
    }
    private static function rollbackAttemptLock(PDO $pdo):void {
        try {
            if($pdo->getAttribute(PDO::ATTR_DRIVER_NAME)==='sqlite')$pdo->exec('ROLLBACK');
            elseif($pdo->inTransaction())$pdo->rollBack();
        } catch(Throwable) {}
    }
    private static function recordFailure(PDO $pdo,string $key,?array $row,int $now):void {
        $started=$row?self::utcTimestamp($row['window_started_at']):$now;
        $count=($row&&$started>$now-900)?(int)$row['request_count']+1:1;
        if($started<=$now-900)$started=$now;
        $blocked=$count>=5?gmdate('Y-m-d H:i:s',$now+900):null;
        if($row){$pdo->prepare('UPDATE admin_login_attempts SET request_count=?,window_started_at=?,blocked_until=?,last_attempt_at=? WHERE attempt_key=?')->execute([$count,gmdate('Y-m-d H:i:s',$started),$blocked,gmdate('Y-m-d H:i:s',$now),$key]);}
        else{$pdo->prepare('INSERT INTO admin_login_attempts (attempt_key,window_started_at,request_count,blocked_until,last_attempt_at) VALUES (?,?,?,?,?)')->execute([$key,gmdate('Y-m-d H:i:s',$started),$count,$blocked,gmdate('Y-m-d H:i:s',$now)]);}
    }
    private static function cleanupAttempts(PDO $pdo,int $now):void {
        $pdo->prepare('DELETE FROM admin_login_attempts WHERE last_attempt_at < ?')->execute([gmdate('Y-m-d H:i:s',$now-86400)]);
    }
    private static function utcTimestamp(mixed $value):int {
        if(!is_string($value)||$value==='')return 0;
        return (new DateTimeImmutable($value,new DateTimeZone('UTC')))->getTimestamp();
    }
}

final class AdminRequest {
    public static function mutationHasValidCsrf(string $method,array $input,array $session):bool {
        return strtoupper($method)!=='POST'||AdminAuth::verifyCsrf($session,(string)($input['csrf']??''));
    }
    public static function publicError(Throwable $error):string {
        return match(true){
            $error instanceof DomainException=>'Operação não permitida.',
            $error instanceof InvalidArgumentException=>'Dados inválidos.',
            default=>'Ocorreu um erro interno. Referência: %s',
        };
    }
}
