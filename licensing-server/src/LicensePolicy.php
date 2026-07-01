<?php
declare(strict_types=1);
final class LicensePolicy {
    public static function duration(string $plan): DateInterval { return match($plan) {
        'demo'=>new DateInterval('P30D'),'one_year'=>new DateInterval('P1Y'),
        'two_years'=>new DateInterval('P2Y'),'three_years'=>new DateInterval('P3Y'),
        default=>throw new InvalidArgumentException('Invalid license plan')}; }
    public static function isRenewable(array $license): bool {
        return in_array($license['plan']??null,['one_year','two_years','three_years'],true)
            && !in_array($license['status']??null,['blocked','revoked','expired'],true);
    }
    public static function assertRenewalPlan(string $plan): void {
        if(!in_array($plan,['one_year','two_years','three_years'],true)) throw new InvalidArgumentException('Invalid renewal plan');
    }
}
