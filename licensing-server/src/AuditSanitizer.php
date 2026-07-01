<?php
declare(strict_types=1);
final class AuditSanitizer {
    public static function clean(array $input):array {
        $out=[];
        foreach($input as $key=>$value){
            $name=strtolower((string)$key);
            if(preg_match('/key|token|password|secret|licen[cs]e.?key/',$name))continue;
            if(is_array($value)){$out[$key]=self::clean($value);continue;}
            if(is_string($value)&&preg_match('/^(bearer\s+|KIL-)/i',$value))continue;
            if(is_scalar($value)||$value===null)$out[$key]=$value;
        }
        return $out;
    }
}
