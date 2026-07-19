<?php
declare(strict_types=1);
require_once __DIR__ . '/LicensePolicy.php';
require_once __DIR__ . '/AuditSanitizer.php';

interface AdminRepository {
    public function transaction(callable $operation): mixed;
    public function createCustomer(array $data): int;
    public function searchCustomers(string $query): array;
    public function createLicense(array $data): int;
    public function lockLicense(int $id): ?array;
    public function updateLicense(int $id, array $changes): void;
    public function deactivateActiveActivation(int $licenseId, string $at): ?int;
    public function addEvent(int $licenseId, ?int $activationId, string $type, array $actor, array $details): void;
    public function searchLicenses(string $query): array;
    public function licenseEvents(int $licenseId, int $limit, int $offset): array;
}

final class AdminService {
    private $clock; private $random;
    public function __construct(private AdminRepository $repo, ?callable $clock=null, ?callable $random=null) {
        $this->clock=$clock ?? static fn()=>new DateTimeImmutable('now', new DateTimeZone('UTC'));
        $this->random=$random ?? 'random_bytes';
    }
    public function createCustomer(array $data): int {
        $name=trim((string)($data['name']??'')); if($name==='') throw new InvalidArgumentException('Nome obrigatório');
        return $this->repo->createCustomer(['name'=>$name,'tax_id'=>$this->nullable($data['tax_id']??null),'email'=>$this->nullable($data['email']??null),'phone'=>$this->nullable($data['phone']??null),'notes'=>$this->nullable($data['notes']??null)]);
    }
    public function issue(int $customerId, string $plan, array $actor): array {
        return $this->repo->transaction(fn() => $this->issueWithinTransaction($customerId,$plan,$actor));
    }

    /**
     * Corrige um plano emitido incorrectamente: revoga a licença antiga (e liberta a
     * máquina associada, se houver) e emite de imediato uma licença nova com o plano
     * correcto para o mesmo cliente — tudo numa única transacção atómica, para que a
     * aplicação da máquina nunca fique bloqueada entre os dois passos.
     */
    public function correctPlan(int $oldLicenseId, string $newPlan, array $actor): array {
        LicensePolicy::assertRenewalPlan($newPlan);
        return $this->repo->transaction(function() use($oldLicenseId,$newPlan,$actor) {
            $old=$this->required($oldLicenseId);
            if ($old['status']==='revoked') throw new DomainException('Esta licença já foi revogada.');
            $now=$this->sql(($this->clock)());
            $deactivatedActivationId=$this->repo->deactivateActiveActivation($oldLicenseId,$now);
            $this->repo->updateLicense($oldLicenseId,['status'=>'revoked','revoked_at'=>$now]);
            $result=$this->issueWithinTransaction((int)$old['customer_id'],$newPlan,$actor);
            $this->repo->addEvent(
                $oldLicenseId,$deactivatedActivationId,'corrected',$actor,
                ['previousPlan'=>$old['plan'],'newPlan'=>$newPlan,'replacedByLicenseId'=>$result['id']]
            );
            return $result;
        });
    }

    private function issueWithinTransaction(int $customerId, string $plan, array $actor): array {
        $now=($this->clock)();
        // Demo: starts_at/expires_at ficam null — LicenseService define-os na 1ª activação
        // e regista o machine_claim. Para planos pagos, o período começa na emissão.
        $startsAt = $plan==='demo' ? null : $this->sql($now);
        $expiresAt = $plan==='demo' ? null : $this->sql($now->add($this->duration($plan)));
        $key=strtoupper(bin2hex(($this->random)(16)));
        $id=$this->repo->createLicense(['public_id'=>$this->uuid(),'customer_id'=>$customerId,'license_key_hash'=>hash('sha256',$key),'plan'=>$plan,'status'=>'active','starts_at'=>$startsAt,'expires_at'=>$expiresAt]);
        $details=['plan'=>$plan];
        if($expiresAt!==null) $details['expiresAt']=$expiresAt;
        $this->repo->addEvent($id,null,'issued',$actor,$details);
        return ['id'=>$id,'licenseKey'=>$key];
    }
    public function renew(int $id,string $plan,array $actor): void {
        LicensePolicy::assertRenewalPlan($plan);
        $this->repo->transaction(function()use($id,$plan,$actor){$l=$this->required($id);if(!LicensePolicy::isRenewable($l))throw new DomainException('License is not renewable');$now=($this->clock)();$stored=isset($l['expires_at'])?new DateTimeImmutable((string)$l['expires_at'],new DateTimeZone('UTC')):null;$base=$stored!==null&&$stored>$now?$stored:$now;$expires=$base->add(LicensePolicy::duration($plan));$this->repo->updateLicense($id,['plan'=>$plan,'status'=>'active','expires_at'=>$this->sql($expires),'revoked_at'=>null]);$this->repo->addEvent($id,null,'renewed',$actor,['plan'=>$plan,'expiresAt'=>$this->sql($expires)]);});
    }
    public function setStatus(int $id,string $status,array $actor): void {
        if(!in_array($status,['blocked','revoked'],true)) throw new InvalidArgumentException('Estado inválido');
        $this->repo->transaction(function()use($id,$status,$actor){$this->required($id);$changes=['status'=>$status];if($status==='revoked')$changes['revoked_at']=$this->sql(($this->clock)());$this->repo->updateLicense($id,$changes);$this->repo->addEvent($id,null,$status,$actor,[]);});
    }
    public function transfer(int $id,array $actor): void {
        $this->repo->transaction(function()use($id,$actor){$this->required($id);$activation=$this->repo->deactivateActiveActivation($id,$this->sql(($this->clock)()));$this->repo->addEvent($id,$activation,'admin_transfer',$actor,['previousActivationDeactivated'=>$activation!==null]);});
    }
    public function customers(string $q=''):array{return $this->repo->searchCustomers(trim($q));}
    public function licenses(string $q=''):array{return $this->repo->searchLicenses(trim($q));}
    public function events(int $id,int $limit=50,int $offset=0):array{return $this->repo->licenseEvents($id,max(1,min(100,$limit)),max(0,$offset));}
    private function required(int $id):array{$l=$this->repo->lockLicense($id);if(!$l)throw new RuntimeException('Licença não encontrada');return $l;}
    private function duration(string $plan):DateInterval{return LicensePolicy::duration($plan);}
    private function sql(DateTimeImmutable $d):string{return $d->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');}
    private function nullable(mixed $v):?string{$v=trim((string)$v);return $v===''?null:$v;}
    private function uuid():string{$b=($this->random)(16);$b[6]=chr((ord($b[6])&15)|64);$b[8]=chr((ord($b[8])&63)|128);return vsprintf('%s%s-%s-%s-%s-%s%s%s',str_split(bin2hex($b),4));}
}

final class PdoAdminRepository implements AdminRepository {
    public function __construct(private PDO $pdo){}
    public function transaction(callable $operation):mixed{$this->pdo->beginTransaction();try{$r=$operation();$this->pdo->commit();return $r;}catch(Throwable $e){if($this->pdo->inTransaction())$this->pdo->rollBack();throw $e;}}
    private function exec(string $sql,array $p=[]):PDOStatement{$s=$this->pdo->prepare($sql);$s->execute($p);return $s;}
    public function createCustomer(array $d):int{$this->exec('INSERT INTO customers (name,tax_id,email,phone,notes) VALUES (?,?,?,?,?)',[$d['name'],$d['tax_id'],$d['email'],$d['phone'],$d['notes']]);return(int)$this->pdo->lastInsertId();}
    public function searchCustomers(string $q):array{$like="%$q%";return $this->exec('SELECT id,name,tax_id,email,phone,status FROM customers WHERE name LIKE ? OR COALESCE(tax_id,"") LIKE ? OR COALESCE(email,"") LIKE ? ORDER BY name LIMIT 100',[$like,$like,$like])->fetchAll(PDO::FETCH_ASSOC);}
    public function createLicense(array $d):int{$this->exec('INSERT INTO licenses (public_id,customer_id,license_key_hash,plan,status,starts_at,expires_at) VALUES (?,?,?,?,?,?,?)',[$d['public_id'],$d['customer_id'],$d['license_key_hash'],$d['plan'],$d['status'],$d['starts_at'],$d['expires_at']]);return(int)$this->pdo->lastInsertId();}
    public function lockLicense(int $id):?array{$r=$this->exec('SELECT * FROM licenses WHERE id=? FOR UPDATE',[$id])->fetch(PDO::FETCH_ASSOC);return is_array($r)?$r:null;}
    public function updateLicense(int $id,array $changes):void{$allowed=['plan','status','expires_at','revoked_at'];$sets=[];$p=[];foreach($changes as $k=>$v){if(!in_array($k,$allowed,true))throw new InvalidArgumentException('Campo inválido');$sets[]="$k=?";$p[]=$v;}$p[]=$id;$this->exec('UPDATE licenses SET '.implode(',',$sets).' WHERE id=?',$p);}
    public function deactivateActiveActivation(int $licenseId,string $at):?int{$r=$this->exec("SELECT id FROM activations WHERE license_id=? AND status='active' FOR UPDATE",[$licenseId])->fetch(PDO::FETCH_ASSOC);if(!$r)return null;$this->exec("UPDATE activations SET status='deactivated',deactivated_at=? WHERE id=?",[$at,$r['id']]);return(int)$r['id'];}
    public function addEvent(int $licenseId,?int $activationId,string $type,array $actor,array $details):void{$safe=AuditSanitizer::clean($details);$this->exec("INSERT INTO license_events (license_id,activation_id,admin_user_id,event_type,actor_type,actor_reference,ip_address,details) VALUES (?,?,?,?,'admin',?,?,?)",[$licenseId,$activationId,$actor['id']??null,$type,$actor['username']??null,$actor['ip']??null,json_encode($safe,JSON_THROW_ON_ERROR)]);}
    public function searchLicenses(string $q):array{$like="%$q%";return $this->exec('SELECT l.id,l.public_id,l.plan,l.status,l.starts_at,l.expires_at,c.name customer_name,(SELECT machine_hash FROM activations a WHERE a.license_id=l.id AND a.status="active" LIMIT 1) machine_hash FROM licenses l JOIN customers c ON c.id=l.customer_id WHERE c.name LIKE ? OR l.public_id LIKE ? OR l.status LIKE ? ORDER BY l.id DESC LIMIT 100',[$like,$like,$like])->fetchAll(PDO::FETCH_ASSOC);}
    public function licenseEvents(int $licenseId,int $limit,int $offset):array{$limit=max(1,min(100,$limit));$offset=max(0,$offset);return $this->exec("SELECT event_type,actor_type,actor_reference,ip_address,details,created_at FROM license_events WHERE license_id=? ORDER BY id DESC LIMIT $limit OFFSET $offset",[$licenseId])->fetchAll(PDO::FETCH_ASSOC);}
}
