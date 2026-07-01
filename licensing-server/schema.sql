SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Requires MySQL 8.0.16+ (CHECK enforcement) or a compatible MariaDB release.
-- Rows that carry licensing/audit history use RESTRICT; lifecycle changes are soft states.

CREATE TABLE customers (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(160) NOT NULL,
    tax_id VARCHAR(50) NULL,
    email VARCHAR(254) NULL,
    phone VARCHAR(40) NULL,
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_customers_tax_id (tax_id),
    KEY idx_customers_name (name),
    KEY idx_customers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE licenses (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    license_key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    plan ENUM('demo', 'one_year', 'two_years', 'three_years') NOT NULL,
    status ENUM('pending', 'active', 'blocked', 'expired', 'revoked') NOT NULL DEFAULT 'pending',
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    starts_at TIMESTAMP NULL DEFAULT NULL,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    admin_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_licenses_public_id (public_id),
    UNIQUE KEY uq_licenses_key_hash (license_key_hash),
    UNIQUE KEY uq_licenses_id_plan (id, plan),
    KEY idx_licenses_customer (customer_id),
    KEY idx_licenses_status_expiry (status, expires_at),
    KEY idx_licenses_plan (plan),
    CONSTRAINT fk_licenses_customer
        FOREIGN KEY (customer_id) REFERENCES customers (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE demo_machine_claims (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    machine_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    license_id BIGINT UNSIGNED NOT NULL,
    license_plan ENUM('demo', 'one_year', 'two_years', 'three_years') NOT NULL DEFAULT 'demo',
    claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_demo_machine_claims_machine (machine_hash),
    UNIQUE KEY uq_demo_machine_claims_license (license_id),
    CONSTRAINT fk_demo_machine_claims_license
        FOREIGN KEY (license_id, license_plan) REFERENCES licenses (id, plan)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_demo_machine_claims_plan CHECK (license_plan = 'demo')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    license_id BIGINT UNSIGNED NOT NULL,
    machine_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    installation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status ENUM('active', 'deactivated') NOT NULL DEFAULT 'active',
    activated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_validated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deactivated_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    active_license_id BIGINT UNSIGNED
        GENERATED ALWAYS AS (
            CASE
                WHEN status = 'active' THEN license_id
                ELSE NULL
            END
        ) STORED,
    PRIMARY KEY (id),
    UNIQUE KEY uq_activations_active_license (active_license_id),
    UNIQUE KEY uq_activations_installation (installation_id),
    KEY idx_activations_license (license_id),
    KEY idx_activations_machine (machine_hash),
    KEY idx_activations_last_validated (last_validated_at),
    CONSTRAINT fk_activations_license
        FOREIGN KEY (license_id) REFERENCES licenses (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT chk_activations_state CHECK (
        (status = 'active' AND deactivated_at IS NULL)
        OR (status = 'deactivated' AND deactivated_at IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE admin_users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    username VARCHAR(80) NOT NULL,
    email VARCHAR(254) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'operator',
    status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_admin_users_username (username),
    UNIQUE KEY uq_admin_users_email (email),
    KEY idx_admin_users_status_role (status, role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE license_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    license_id BIGINT UNSIGNED NOT NULL,
    activation_id BIGINT UNSIGNED NULL,
    admin_user_id BIGINT UNSIGNED NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_type ENUM('system', 'client', 'admin') NOT NULL,
    actor_reference VARCHAR(160) NULL,
    ip_address VARCHAR(45) NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_license_events_license_created (license_id, created_at),
    KEY idx_license_events_activation (activation_id),
    KEY idx_license_events_admin (admin_user_id),
    KEY idx_license_events_type_created (event_type, created_at),
    CONSTRAINT fk_license_events_license
        FOREIGN KEY (license_id) REFERENCES licenses (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    CONSTRAINT fk_license_events_activation
        FOREIGN KEY (activation_id) REFERENCES activations (id)
        ON UPDATE RESTRICT ON DELETE SET NULL,
    CONSTRAINT fk_license_events_admin
        FOREIGN KEY (admin_user_id) REFERENCES admin_users (id)
        ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
