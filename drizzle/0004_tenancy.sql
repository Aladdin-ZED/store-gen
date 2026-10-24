-- 0004 tenancy (docs/STORE-SAAS.md §D.2, §D.4, §D.8; R1.0 contract step C0a): stores, members, plans, the
-- platform tables, store_id on every tenant table, and the store #1 conversion of single-tenant data.
--
-- Guarded and idempotent like 0002/0003: MariaDB commits DDL implicitly, so drizzle's single transaction is not
-- atomic (node_modules/drizzle-orm/mysql-core/dialect.js); every statement is safe to run twice and to resume after
-- a crash at any statement. New tables use CREATE TABLE IF NOT EXISTS; columns, indexes and FKs are probed in
-- information_schema and applied through PREPARE/EXECUTE (portable: no ADD COLUMN IF NOT EXISTS, no SKIP LOCKED,
-- no JSON type, no VECTOR, no RETURNING; MariaDB 10.4 and MySQL 8). Every backfill is a no-op on an empty database.
-- The column, index and FK definitions are drizzle-kit's for src/lib/db/schema.ts (meta/0004_snapshot.json).
-- Store #1 is the constant 00000000000000000000000001; the JS half of the conversion (envelopes, names, the
-- home setting, the pixel library, asset_refs, the tenancy_v1 marker) is T1's convertLegacyStore().

-- 1. Every §D.4 table (plans first, then stores, then the rest). One CREATE per table with its keys and FKs
-- inline, so a crash never leaves a table half-indexed; IF NOT EXISTS makes a rerun skip what exists.
CREATE TABLE IF NOT EXISTS `plans` (
	`id` varchar(32) NOT NULL,
	`name` varchar(60) NOT NULL,
	`status` enum('active','hidden','retired') NOT NULL DEFAULT 'active',
	`sort` int NOT NULL DEFAULT 0,
	`limits` longtext NOT NULL,
	`features` longtext NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `plans_id` PRIMARY KEY(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stores` (
	`id` varchar(26) NOT NULL,
	`handle` varchar(30),
	`name` varchar(120) NOT NULL,
	`mode` enum('landing','store','both') NOT NULL DEFAULT 'landing',
	`status` enum('pending','active','restricted','suspended','closed','scheduled_deletion','purged','rejected') NOT NULL DEFAULT 'pending',
	`status_reason` varchar(40),
	`status_note` varchar(500),
	`status_changed_at` datetime(3),
	`status_changed_by` varchar(26),
	`suspend_notice` boolean NOT NULL DEFAULT false,
	`closed_at` datetime(3),
	`purge_after` datetime(3),
	`plan_id` varchar(32) NOT NULL DEFAULT 'beta',
	`market` varchar(8) NOT NULL DEFAULT 'MA',
	`currency` char(3) NOT NULL DEFAULT 'MAD',
	`timezone` varchar(40) NOT NULL DEFAULT 'Africa/Casablanca',
	`default_locale` varchar(5) NOT NULL DEFAULT 'ar',
	`locales` longtext,
	`category` varchar(40),
	`home_page_id` varchar(26),
	`brand_seed` char(16) NOT NULL,
	`catalog_version` int NOT NULL DEFAULT 0,
	`address_version` int NOT NULL DEFAULT 0,
	`require_member_2fa` boolean NOT NULL DEFAULT false,
	`created_by` varchar(26),
	`approved_at` datetime(3),
	`approved_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `stores_handle_uq` UNIQUE(`handle`),
	KEY `stores_status_idx` (`status`,`created_at`),
	KEY `stores_plan_idx` (`plan_id`),
	CONSTRAINT `fk_stores_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_members` (
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`role` enum('owner','admin','manager','editor','agent','logistics','accountant','viewer') NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`title` varchar(60),
	`invited_by` varchar(26),
	`joined_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`last_active_at` datetime(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_members_store_id_user_id_pk` PRIMARY KEY(`store_id`,`user_id`),
	KEY `sm_user_idx` (`user_id`),
	KEY `sm_store_role_idx` (`store_id`,`role`,`status`),
	CONSTRAINT `fk_store_members_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT `fk_store_members_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_invites` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`email_norm` varchar(191) NOT NULL,
	`role` enum('owner','admin','manager','editor','agent','logistics','accountant','viewer') NOT NULL,
	`token_hash` char(64) NOT NULL,
	`note` varchar(200),
	`invited_by` varchar(26) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`accepted_at` datetime(3),
	`accepted_by` varchar(26),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `si_token_uq` UNIQUE(`token_hash`),
	KEY `si_store_idx` (`store_id`,`created_at`),
	KEY `si_store_email_idx` (`store_id`,`email_norm`),
	CONSTRAINT `fk_store_invites_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_settings` (
	`store_id` varchar(26) NOT NULL,
	`key` varchar(64) NOT NULL,
	`value` longtext NOT NULL,
	`encrypted` boolean NOT NULL DEFAULT false,
	`purpose_v` tinyint NOT NULL DEFAULT 2,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_settings_store_id_key_pk` PRIMARY KEY(`store_id`,`key`),
	CONSTRAINT `fk_store_settings_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_handle_history` (
	`handle` varchar(30) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`reason` enum('renamed','deleted') NOT NULL,
	`redirect_until` datetime(3),
	`reserved_until` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_handle_history_handle` PRIMARY KEY(`handle`),
	KEY `shh_store_idx` (`store_id`),
	CONSTRAINT `fk_store_handle_history_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_entitlements` (
	`store_id` varchar(26) NOT NULL,
	`key` varchar(48) NOT NULL,
	`source` enum('override','boost') NOT NULL,
	`value` longtext NOT NULL,
	`expires_at` datetime(3),
	`set_by` varchar(26) NOT NULL,
	`reason` varchar(200) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_entitlements_store_id_key_source_pk` PRIMARY KEY(`store_id`,`key`,`source`),
	CONSTRAINT `fk_store_entitlements_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_usage` (
	`store_id` varchar(26) NOT NULL,
	`metric` varchar(32) NOT NULL,
	`period` varchar(10) NOT NULL,
	`value` bigint NOT NULL DEFAULT 0,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_usage_store_id_metric_period_pk` PRIMARY KEY(`store_id`,`metric`,`period`),
	CONSTRAINT `fk_store_usage_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_subscriptions` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`plan_id` varchar(32) NOT NULL,
	`status` enum('active','scheduled','ended') NOT NULL,
	`provider` enum('manual') NOT NULL DEFAULT 'manual',
	`provider_ref` varchar(120),
	`period_start` datetime(3) NOT NULL,
	`period_end` datetime(3),
	`created_by` varchar(26) NOT NULL,
	`note` varchar(300),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_subscriptions_id` PRIMARY KEY(`id`),
	KEY `ssub_store_idx` (`store_id`,`status`),
	KEY `ssub_plan_idx` (`plan_id`),
	CONSTRAINT `fk_store_subscriptions_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
	CONSTRAINT `fk_store_subscriptions_plan` FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `page_slug_history` (
	`store_id` varchar(26) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`page_id` varchar(26) NOT NULL,
	`until` datetime(3) NOT NULL,
	`hits` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `page_slug_history_store_id_slug_pk` PRIMARY KEY(`store_id`,`slug`),
	KEY `psh_page_idx` (`store_id`,`page_id`),
	CONSTRAINT `fk_page_slug_history_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `preview_tokens` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`page_id` varchar(26) NOT NULL,
	`audience` enum('staff','seller') NOT NULL,
	`staff_user_id` varchar(26),
	`created_by` varchar(26),
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`opened` int NOT NULL DEFAULT 0,
	`last_opened_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `preview_tokens_id` PRIMARY KEY(`id`),
	KEY `pt_store_page_idx` (`store_id`,`page_id`,`expires_at`),
	KEY `pt_exp_idx` (`expires_at`),
	CONSTRAINT `fk_preview_tokens_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_invites` (
	`id` varchar(26) NOT NULL,
	`code_hash` char(64) NOT NULL,
	`label` varchar(120),
	`uses_max` int NOT NULL DEFAULT 1,
	`uses` int NOT NULL DEFAULT 0,
	`auto_approve` boolean NOT NULL DEFAULT false,
	`expires_at` datetime(3),
	`created_by` varchar(26) NOT NULL,
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `platform_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `pi_code_uq` UNIQUE(`code_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `waitlist` (
	`id` varchar(26) NOT NULL,
	`email_norm` varchar(191) NOT NULL,
	`phone` varchar(24),
	`note` varchar(300),
	`locale` varchar(5),
	`ip_hash` char(64),
	`invite_id` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`source` varchar(40),
	`market` varchar(8),
	`mode_interest` enum('landing','store','both'),
	`status` enum('waiting','invited','dropped') NOT NULL DEFAULT 'waiting',
	`invited_at` datetime(3),
	`invited_by` varchar(26),
	CONSTRAINT `waitlist_id` PRIMARY KEY(`id`),
	CONSTRAINT `wl_email_uq` UNIQUE(`email_norm`),
	KEY `wl_status_idx` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `password_resets` (
	`id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`created_by` varchar(26),
	`reason` varchar(200),
	`expires_at` datetime(3) NOT NULL,
	`used_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `password_resets_id` PRIMARY KEY(`id`),
	CONSTRAINT `pr_token_uq` UNIQUE(`token_hash`),
	KEY `pr_user_idx` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `impersonation_sessions` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`staff_user_id` varchar(26) NOT NULL,
	`session_id` char(64) NOT NULL,
	`mode` enum('read') NOT NULL DEFAULT 'read',
	`reason` enum('ticket','onboarding','abuse_review','bug','other') NOT NULL,
	`note` varchar(300),
	`ticket_ref` varchar(60),
	`started_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3) NOT NULL,
	`ended_at` datetime(3),
	`ended_reason` enum('ended','expired','revoked'),
	CONSTRAINT `impersonation_sessions_id` PRIMARY KEY(`id`),
	KEY `imp_store_idx` (`store_id`,`started_at`),
	KEY `imp_staff_idx` (`staff_user_id`,`started_at`),
	CONSTRAINT `fk_impersonation_sessions_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `signup_reviews` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`kind` enum('signup','reopen','go_live','plan_change','limit_raise','mode_change','domain') NOT NULL DEFAULT 'signup',
	`score` tinyint NOT NULL,
	`signals` longtext NOT NULL,
	`status` enum('pending','needs_info','approved','rejected','snoozed','withdrawn') NOT NULL DEFAULT 'pending',
	`snooze_until` datetime(3),
	`business_context` longtext,
	`decided_by` varchar(26),
	`decided_at` datetime(3),
	`reason_code` varchar(40),
	`reason_note` varchar(500),
	`appeals` tinyint NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`band` enum('fast','review','hold','reject_candidate') NOT NULL DEFAULT 'review',
	`request` longtext,
	`submitted_at` datetime(3),
	`staff_question` varchar(500),
	`answered_at` datetime(3),
	`blocked` boolean NOT NULL DEFAULT false,
	CONSTRAINT `signup_reviews_id` PRIMARY KEY(`id`),
	KEY `sr_store_idx` (`store_id`,`created_at`),
	KEY `sr_queue_idx` (`status`,`score`,`created_at`),
	KEY `sr_kind_queue_idx` (`kind`,`status`,`created_at`),
	KEY `sr_store_kind_idx` (`store_id`,`kind`,`status`),
	CONSTRAINT `fk_signup_reviews_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `identity_links` (
	`user_id` varchar(26) NOT NULL,
	`kind` enum('email_norm','phone','net','device') NOT NULL,
	`value_hash` char(64) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`source` enum('signup','login','invite','staff') NOT NULL DEFAULT 'signup',
	CONSTRAINT `identity_links_kind_value_hash_user_id_pk` PRIMARY KEY(`kind`,`value_hash`,`user_id`),
	KEY `il_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `protected_brands` (
	`id` varchar(26) NOT NULL,
	`term` varchar(60) NOT NULL,
	`kind` enum('brand','bank','carrier','gov','platform','offensive') NOT NULL,
	`match` enum('exact','substring','skeleton') NOT NULL DEFAULT 'substring',
	`added_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`active` boolean NOT NULL DEFAULT true,
	`note` varchar(200),
	CONSTRAINT `protected_brands_id` PRIMARY KEY(`id`),
	CONSTRAINT `pb_term_uq` UNIQUE(`term`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legal_documents` (
	`id` varchar(26) NOT NULL,
	`kind` enum('tos','privacy','aup','dpa','store_privacy','store_terms','store_shipping','store_returns','store_contact') NOT NULL,
	`locale` varchar(5) NOT NULL,
	`version` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` longtext NOT NULL,
	`status` enum('draft','published','retired') NOT NULL DEFAULT 'draft',
	`needs_legal_review` boolean NOT NULL DEFAULT true,
	`published_at` datetime(3),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`summary` varchar(500),
	`effective_at` datetime(3),
	`requires_reacceptance` boolean NOT NULL DEFAULT false,
	`reviewed_at` datetime(3),
	`reviewed_by` varchar(26),
	`ack_unreviewed_by` varchar(26),
	`ack_unreviewed_at` datetime(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `legal_documents_id` PRIMARY KEY(`id`),
	CONSTRAINT `ld_kind_loc_ver_uq` UNIQUE(`kind`,`locale`,`version`),
	KEY `ld_kind_status_idx` (`kind`,`locale`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `legal_acceptances` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`store_id` varchar(26),
	`document_id` varchar(26) NOT NULL,
	`accepted_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`ip_hash` char(64),
	`ua` varchar(300),
	`context` enum('signup','reaccept','invite','staff') NOT NULL DEFAULT 'signup',
	CONSTRAINT `legal_acceptances_id` PRIMARY KEY(`id`),
	KEY `la_user_idx` (`user_id`,`accepted_at`),
	KEY `la_doc_idx` (`document_id`),
	KEY `la_store_idx` (`store_id`),
	CONSTRAINT `fk_legal_acceptances_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notifications` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26),
	`user_id` varchar(26),
	`audience` enum('user','store','store_role','platform_staff') NOT NULL,
	`roles` longtext,
	`kind` varchar(40) NOT NULL,
	`severity` enum('info','success','warn','danger') NOT NULL DEFAULT 'info',
	`vars` longtext,
	`text` varchar(600),
	`link` varchar(300),
	`dedupe_key` varchar(120),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`expires_at` datetime(3),
	`platform_min_role` enum('super_admin','admin','support','analyst'),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `nt_dedupe_uq` UNIQUE(`dedupe_key`),
	KEY `nt_store_idx` (`store_id`,`id`),
	KEY `nt_user_idx` (`user_id`,`id`),
	KEY `nt_aud_idx` (`audience`,`id`),
	CONSTRAINT `fk_notifications_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_reads` (
	`notification_id` bigint NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`read_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notification_reads_notification_id_user_id_pk` PRIMARY KEY(`notification_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flags` (
	`key` varchar(64) NOT NULL,
	`kind` enum('release','ops','kill','experiment') NOT NULL,
	`description` varchar(300),
	`default_value` longtext NOT NULL,
	`rules` longtext,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`owner_track` varchar(16),
	`archived` boolean NOT NULL DEFAULT false,
	`type` enum('boolean','number','string','json') NOT NULL DEFAULT 'boolean',
	CONSTRAINT `flags_key` PRIMARY KEY(`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `flag_overrides` (
	`flag_key` varchar(64) NOT NULL,
	`scope` enum('store','user','plan','market') NOT NULL,
	`scope_id` varchar(40) NOT NULL,
	`value` longtext NOT NULL,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`note` varchar(200),
	`expires_at` datetime(3),
	CONSTRAINT `flag_overrides_flag_key_scope_scope_id_pk` PRIMARY KEY(`flag_key`,`scope`,`scope_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `asset_refs` (
	`store_id` varchar(26) NOT NULL,
	`asset_id` varchar(64) NOT NULL,
	`owner_kind` enum('page','page_version','product','collection','store_theme','brand','settings','review','ticket') NOT NULL,
	`owner_id` varchar(64) NOT NULL,
	`live` boolean NOT NULL DEFAULT false,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `asset_refs_store_id_asset_id_owner_kind_owner_id_pk` PRIMARY KEY(`store_id`,`asset_id`,`owner_kind`,`owner_id`),
	KEY `ar_owner_idx` (`store_id`,`owner_kind`,`owner_id`),
	CONSTRAINT `fk_asset_refs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
-- 2. Seeds (§A.4, §D.4), INSERT IGNORE: the console edits these rows and a rerun never overwrites them. Plans:
-- beta = the registry defaults (every new store), pro = the §A.4 overrides, internal (platform-owned stores, hidden
-- from sellers) = every limit unlimited and every feature on.
INSERT IGNORE INTO `plans` (`id`, `name`, `status`, `sort`, `limits`, `features`, `created_at`, `updated_at`) VALUES
('beta', 'Beta', 'active', 0, '{}', '{}', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
('pro', 'Pro', 'active', 10, '{"media_bytes":5368709120,"pages_max":200,"products_max":2000,"members_max":30,"agents_max":30,"exports_month":200,"ai_credits_month":1500,"webhooks_max":10}', '{"api_keys":true,"experiments":true,"custom_domain":true,"remove_platform_badge":true}', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
('internal', 'Internal', 'hidden', 90, '{"media_bytes":null,"pages_max":null,"products_max":null,"members_max":null,"agents_max":null,"versions_kept_per_page":null,"exports_month":null,"ai_credits_month":null,"webhooks_max":null,"custom_domains_max":null,"orders_month_soft":null,"campaigns_max":null,"short_links_max":null}', '{"publish":true,"take_orders":true,"mode_landing":true,"mode_store":true,"mode_both":true,"sheets":true,"pixels_capi":true,"php_export":true,"telegram":true,"cloud_ai":true,"invites":true,"webhooks":true,"accounting":true,"commissions":true,"api_keys":true,"custom_domain":true,"experiments":true,"coupons":true,"reviews":true,"remove_platform_badge":true}', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3));--> statement-breakpoint
-- Kill switches (§H.8): kind kill, read through the 30 s flags cache. Release and ops flags are declared in code
-- (src/lib/flags/defs/<track>.ts) and seeded at boot, never here.
INSERT IGNORE INTO `flags` (`key`, `kind`, `description`, `default_value`, `type`, `owner_track`, `updated_at`) VALUES
('signups_enabled', 'kill', 'Sign-up and invite-accept forms (closed for now when off)', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('publishing_enabled', 'kill', 'Publishing pages (feature_off when off)', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('ai_generation_enabled', 'kill', 'Cloud and server AI tasks; local and library keep working', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('sheets_sync_enabled', 'kill', 'Google Sheets jobs (orders stay pending when off)', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('capi_enabled', 'kill', 'Conversions API deliveries (outbox items wait when off)', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('uploads_enabled', 'kill', 'Media uploads', 'true', 'boolean', 'core', UTC_TIMESTAMP(3)),
('platform_read_only', 'kill', 'Every store and console write refused (read_only); public order, lead and event APIs keep working', 'false', 'boolean', 'core', UTC_TIMESTAMP(3));--> statement-breakpoint
-- 3. S1, store #1 (constant id, D27): only when the database already holds single-tenant data. The condition covers
-- every table step 4 backfills, so a store_id is never pointed at a store that does not exist. The handle is the
-- store name lower-cased, non [a-z0-9] runs -> '-', cut to 30, outer '-' trimmed (ENGC-30), used only when it passes
-- isHandle (HANDLE_RE, ASCII only, no '--' at positions 3-4), is not reserved (RESERVED_HANDLES as of C0a) or
-- protected, and is free; else 'store-1'. T1's convertLegacyStore() does the rest (names, envelopes, the marker).
INSERT INTO `stores` (`id`, `handle`, `name`, `mode`, `status`, `plan_id`, `market`, `currency`, `timezone`, `default_locale`, `brand_seed`, `created_at`, `updated_at`)
SELECT '00000000000000000000000001',
       COALESCE((SELECT d.h FROM (SELECT TRIM(BOTH '-' FROM LEFT(REGEXP_REPLACE(LOWER(COALESCE((SELECT CASE WHEN JSON_VALID(`value`) THEN JSON_UNQUOTE(JSON_EXTRACT(`value`, '$.storeName')) END FROM `settings` WHERE `key` = 'store'), '')), '[^a-z0-9]+', '-'), 30)) AS h) d
                 WHERE d.h REGEXP '^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$' AND CHAR_LENGTH(d.h) = LENGTH(d.h) AND SUBSTRING(d.h, 3, 2) <> '--'
                   AND d.h NOT IN ('_next', 'abuse', 'account', 'accounts', 'admin', 'administrator', 'affiliates', 'api', 'app', 'assets', 'auth', 'autoconfig', 'autodiscover', 'beta', 'billing', 'blog', 'cdn', 'checkout', 'console', 'cpanel', 'd', 'danger', 'dashboard', 'demo', 'dev', 'docs', 'edge', 'favicon.ico', 'files', 'fonts', 'ftp', 'go', 'health', 'help', 'hostmaster', 'hpanel', 'id', 'images', 'imap', 'img', 'internal', 'invite', 'l', 'legal', 'link', 'links', 'login', 'mail', 'manifest.webmanifest', 'media', 'merci', 'mx', 'new', 'news', 'ns1', 'ns2', 'oauth', 'origin', 'partners', 'pay', 'payment', 'platform', 'pop', 'pop3', 'postmaster', 'preview', 'pricing', 'privacy', 'register', 'reset', 'robots.txt', 'root', 's', 'sandbox', 'secure', 'security', 'sessions', 'setup', 'sftp', 'shop', 'signin', 'signup', 'sitemap.xml', 'smtp', 'sso', 'staging', 'static', 'status', 'store', 'stores', 'support', 'system', 'terms', 'test', 'track', 'two-factor', 'uploads', 'wallet', 'webmail', 'webmaster', 'www')
                   AND NOT EXISTS (SELECT 1 FROM `protected_brands` pb WHERE pb.`term` = d.h)
                   AND NOT EXISTS (SELECT 1 FROM `stores` s WHERE s.`handle` = d.h)), 'store-1'),
       LEFT(COALESCE(NULLIF(TRIM((SELECT CASE WHEN JSON_VALID(`value`) THEN JSON_UNQUOTE(JSON_EXTRACT(`value`, '$.storeName')) END FROM `settings` WHERE `key` = 'store')), ''), 'Store 1'), 120),
       'landing', 'active', 'internal', 'MA', 'MAD', 'Africa/Casablanca', 'ar', LEFT(SHA2(UUID(), 256), 16), UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM `stores` WHERE `id` = '00000000000000000000000001')
  AND (EXISTS (SELECT 1 FROM `users`)
       OR EXISTS (SELECT 1 FROM `pages`)
       OR EXISTS (SELECT 1 FROM `page_versions`)
       OR EXISTS (SELECT 1 FROM `assets`)
       OR EXISTS (SELECT 1 FROM `media_files`)
       OR EXISTS (SELECT 1 FROM `orders`)
       OR EXISTS (SELECT 1 FROM `leads`)
       OR EXISTS (SELECT 1 FROM `blocklist`)
       OR EXISTS (SELECT 1 FROM `exports`)
       OR EXISTS (SELECT 1 FROM `stats_daily`)
       OR EXISTS (SELECT 1 FROM `audit_log` WHERE `action` NOT LIKE 'auth.%'));--> statement-breakpoint
-- 4. store_id on the nine legacy tenant tables: added NULL, backfilled with store #1 (a no-op on an empty database),
-- then tightened to NOT NULL without a default while still nullable. The FKs come after the indexes (step 7).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `pages` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `pages` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `page_versions` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `page_versions` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `page_versions` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `assets` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `assets` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `assets` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `media_files` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media_files' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `media_files` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `media_files` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media_files' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `orders` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `orders` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `leads` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `leads` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `blocklist` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'blocklist' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `blocklist` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `blocklist` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'blocklist' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `exports` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exports' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `exports` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `exports` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'exports' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `stats_daily` ADD `store_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stats_daily' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `stats_daily` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `stats_daily` MODIFY `store_id` varchar(26) NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'stats_daily' AND column_name = 'store_id' AND is_nullable = 'YES');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- audit_log.store_id stays NULL-able (NULL = a platform or auth event): legacy auth.* rows keep NULL, the rest are store #1's.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `audit_log` ADD `store_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND column_name = 'store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
UPDATE `audit_log` SET `store_id` = '00000000000000000000000001' WHERE `store_id` IS NULL AND `action` NOT LIKE 'auth.%' AND EXISTS (SELECT 1 FROM `stores` WHERE `id` = '00000000000000000000000001');--> statement-breakpoint
-- 5. The other §D.2 columns of 0004 (NULL-able or defaulted).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `platform_role` enum(''none'',''super_admin'',''admin'',''support'',''analyst'') NOT NULL DEFAULT ''none''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'platform_role');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `locale` varchar(5)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'locale');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `phone` varchar(24)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'phone');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `disabled_reason` varchar(200)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'disabled_reason');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `users` ADD `disabled_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'disabled_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sessions` ADD `last_store_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'last_store_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sessions` ADD `impersonation_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'impersonation_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `sessions` ADD `step_up_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sessions' AND column_name = 'step_up_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `kind` enum(''landing'',''home'',''product'',''collection'',''page'',''policy'',''search'',''cart'',''checkout'',''not_found'') NOT NULL DEFAULT ''landing''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'kind');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `product_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'product_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `first_published_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'first_published_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- rev 5 (CRIT2-5): the first publish instant from the oldest publish version; never-published pages keep NULL.
UPDATE `pages` p SET p.`first_published_at` = (SELECT MIN(v.`created_at`) FROM `page_versions` v WHERE v.`page_id` = p.`id` AND v.`kind` = 'publish') WHERE p.`first_published_at` IS NULL;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `assets` ADD `stored_bytes` bigint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'assets' AND column_name = 'stored_bytes');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- master + every variant (MED-03).
UPDATE `assets` a SET a.`stored_bytes` = (SELECT COALESCE(SUM(m.`bytes`), 0) FROM `media_files` m WHERE m.`asset_id` = a.`id`) WHERE a.`stored_bytes` = 0;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `media_files` ADD `storage` enum(''db'',''fs'') NOT NULL DEFAULT ''db''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'media_files' AND column_name = 'storage');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `audit_log` ADD `actor_kind` enum(''user'',''platform'',''impersonation'',''system'',''api'') NOT NULL DEFAULT ''user''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND column_name = 'actor_kind');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `audit_log` ADD `impersonator_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND column_name = 'impersonator_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `is_test` boolean NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'is_test');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `is_test` boolean NOT NULL DEFAULT false', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'is_test');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 6. S2: the old global home page becomes store #1's home, read while pages.is_home still exists (a rerun after
-- the drop skips it), then the column is dropped (DB-02). settings.home is moved by the JS task.
SET @ddl := (SELECT IF(COUNT(*) = 1, 'UPDATE `stores` SET `home_page_id` = (SELECT `id` FROM `pages` WHERE `is_home` = 1 ORDER BY `updated_at` DESC LIMIT 1) WHERE `id` = ''00000000000000000000000001'' AND `home_page_id` IS NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'is_home');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `pages` DROP COLUMN `is_home`', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'is_home');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 7. Unique and index swaps of §D.2: every new store-first index is created before the global one it replaces is dropped.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `users_prole_idx` ON `users` (`platform_role`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_prole_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `pages_store_slug_uq` ON `pages` (`store_id`,`slug`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'pages' AND index_name = 'pages_store_slug_uq');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `pages_store_status_idx` ON `pages` (`store_id`,`status`,`updated_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'pages' AND index_name = 'pages_store_status_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `pv_store_idx` ON `page_versions` (`store_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND index_name = 'pv_store_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `assets_store_created_idx` ON `assets` (`store_id`,`created_at`,`id`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'assets' AND index_name = 'assets_store_created_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `assets_store_kind_idx` ON `assets` (`store_id`,`kind`,`alpha`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'assets' AND index_name = 'assets_store_kind_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `assets_store_source_idx` ON `assets` (`store_id`,`source_asset_id`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'assets' AND index_name = 'assets_store_source_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `mf_store_idx` ON `media_files` (`store_id`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'media_files' AND index_name = 'mf_store_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_created_idx` ON `orders` (`store_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_created_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_status_idx` ON `orders` (`store_id`,`status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_status_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_sheet_idx` ON `orders` (`store_id`,`sheet_status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_sheet_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_phone_idx` ON `orders` (`store_id`,`phone`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_phone_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_ip_idx` ON `orders` (`store_id`,`ip_hash`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_ip_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_page_idx` ON `orders` (`store_id`,`page_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_page_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_store_test_idx` ON `orders` (`store_id`,`is_test`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_store_test_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `leads_store_created_idx` ON `leads` (`store_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_created_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `block_store_uq` ON `blocklist` (`store_id`,`kind`,`value`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'blocklist' AND index_name = 'block_store_uq');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `exports_store_idx` ON `exports` (`store_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'exports' AND index_name = 'exports_store_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `sd_store_day_idx` ON `stats_daily` (`store_id`,`day`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'stats_daily' AND index_name = 'sd_store_day_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `audit_store_idx` ON `audit_log` (`store_id`,`id`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND index_name = 'audit_store_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- The replaced global indexes.
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `pages` DROP INDEX `pages_slug_uq`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'pages' AND index_name = 'pages_slug_uq');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `assets` DROP INDEX `assets_created_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'assets' AND index_name = 'assets_created_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `blocklist` DROP INDEX `block_uq`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'blocklist' AND index_name = 'block_uq');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `orders` DROP INDEX `orders_phone_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_phone_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `orders` DROP INDEX `orders_page_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_page_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `orders` DROP INDEX `orders_status_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_status_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `orders` DROP INDEX `orders_sheet_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_sheet_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) > 0, 'ALTER TABLE `orders` DROP INDEX `orders_ip_idx`', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_ip_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- fk_<table>_store (RESTRICT), added after the store-first indexes so InnoDB serves each with one of them and
-- never creates an index of its own that schema.ts does not list.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD CONSTRAINT `fk_pages_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'pages' AND constraint_name = 'fk_pages_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `page_versions` ADD CONSTRAINT `fk_page_versions_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND constraint_name = 'fk_page_versions_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `assets` ADD CONSTRAINT `fk_assets_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'assets' AND constraint_name = 'fk_assets_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `media_files` ADD CONSTRAINT `fk_media_files_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'media_files' AND constraint_name = 'fk_media_files_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD CONSTRAINT `fk_orders_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'orders' AND constraint_name = 'fk_orders_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD CONSTRAINT `fk_leads_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'leads' AND constraint_name = 'fk_leads_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `blocklist` ADD CONSTRAINT `fk_blocklist_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'blocklist' AND constraint_name = 'fk_blocklist_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `exports` ADD CONSTRAINT `fk_exports_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'exports' AND constraint_name = 'fk_exports_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `stats_daily` ADD CONSTRAINT `fk_stats_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'stats_daily' AND constraint_name = 'fk_stats_daily_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `audit_log` ADD CONSTRAINT `fk_audit_log_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT', 'DO 0') FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'audit_log' AND constraint_name = 'fk_audit_log_store' AND constraint_type = 'FOREIGN KEY');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 8. S3: legacy memberships from users.role (TENANCY-MAP §2.4 step 6), and the legacy owner becomes super_admin.
INSERT IGNORE INTO `store_members` (`store_id`, `user_id`, `role`, `status`, `joined_at`, `updated_at`)
SELECT '00000000000000000000000001', `id`,
       CASE `role` WHEN 'owner' THEN 'owner' WHEN 'editor' THEN 'editor' ELSE 'agent' END,
       IF(`disabled`, 'suspended', 'active'), `created_at`, UTC_TIMESTAMP(3)
FROM `users` WHERE EXISTS (SELECT 1 FROM `stores` WHERE `id` = '00000000000000000000000001');--> statement-breakpoint
UPDATE `users` SET `platform_role` = 'super_admin'
WHERE `role` = 'owner' AND `platform_role` = 'none' AND EXISTS (SELECT 1 FROM `stores` WHERE `id` = '00000000000000000000000001');--> statement-breakpoint
-- 9. S4: store-level settings rows, kept in their v1 envelopes (purpose_v = 0) until the JS task re-seals them;
-- getStoreSetting opens purpose_v = 0 rows with openLegacy (ENGC-19). ai, home and pixels stay in settings for the
-- JS task, which also deletes the moved keys from settings.
INSERT IGNORE INTO `store_settings` (`store_id`, `key`, `value`, `encrypted`, `purpose_v`, `updated_at`)
SELECT '00000000000000000000000001', `key`, `value`, `encrypted`, 0, `updated_at` FROM `settings`
WHERE `key` IN ('store', 'defaults', 'sheets', 'pixel_library', 'pixel_health', 'tracking_secrets', 'turnstile')
  AND EXISTS (SELECT 1 FROM `stores` WHERE `id` = '00000000000000000000000001');
