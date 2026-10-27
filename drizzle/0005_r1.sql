-- 0005 R1 product (docs/STORE-SAAS.md §D.2, §D.5, §D.8, §H.2, §H.3; R1 contract step P0): the R1 product tables
-- (platform, landing, operations, ai, design, core jobs) and the 0005 columns and indexes of users, page_versions,
-- orders and leads. The cited part sections are the column lists (§D.5, §D.9): PLA-§2.2, LAN-§2.1 / §2.2,
-- OPE-§2.1 … §2.7, AI-§M.1 / §M.2, DES-§2.1 / §2.2.
--
-- Guarded and idempotent like 0004: MariaDB commits DDL implicitly, so drizzle's single transaction is not atomic
-- (node_modules/drizzle-orm/mysql-core/dialect.js); every statement is safe to run twice and to resume after a crash
-- at any statement. Additive only and safe on the live R1.0 database (§D.8 "0005-0007"): new tables, appended enum
-- values (the existing values keep their order), new NULL-able or defaulted columns, new indexes, and the one guarded
-- type change of 0005 (leads.phone → NULL-able, LAN Q2). No backfill beyond defaults. Portable SQL (MariaDB 10.4 and
-- MySQL 8): no ADD COLUMN IF NOT EXISTS, no SKIP LOCKED, no JSON type, no VECTOR, no RETURNING.
-- The column, index and FK definitions are drizzle-kit's for src/lib/db/schema.ts (meta/0005_snapshot.json).

-- 1. Every new table, one CREATE each with its keys, uniques and FK inline, so a crash never leaves a table
-- half-indexed; IF NOT EXISTS makes a rerun skip what exists. Every FK is fk_<table>_store (RESTRICT), served by the
-- table's first store_id index, so InnoDB never adds an index of its own that schema.ts does not list.
CREATE TABLE IF NOT EXISTS `abuse_reports` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`page_url` varchar(500),
	`reason` enum('phishing','scam','counterfeit','prohibited','impersonation','other') NOT NULL,
	`details` text,
	`reporter_contact_enc` text,
	`status` enum('new','triaged','actioned','dismissed') NOT NULL DEFAULT 'new',
	`action_taken` varchar(40),
	`ip_hash` char(64) NOT NULL,
	`handled_by` varchar(26),
	`handled_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `abuse_reports_id` PRIMARY KEY(`id`),
	KEY `ar_status_idx` (`status`,`created_at`),
	KEY `ar_store_idx` (`store_id`,`created_at`),
	KEY `ar_ip_idx` (`ip_hash`,`created_at`),
	CONSTRAINT `fk_abuse_reports_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ad_spend_daily` (
	`store_id` varchar(26) NOT NULL,
	`platform` enum('meta','tiktok','snap','google','other') NOT NULL,
	`account_id` varchar(40) NOT NULL DEFAULT '',
	`campaign_id` varchar(64) NOT NULL DEFAULT '',
	`day` date NOT NULL,
	`campaign_name` varchar(160),
	`spend_cents` bigint NOT NULL,
	`currency` char(3) NOT NULL,
	`source` enum('manual','csv','api') NOT NULL DEFAULT 'manual',
	`import_run_id` varchar(26),
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ad_spend_daily_store_id_platform_account_id_campaign_id_day_pk` PRIMARY KEY(`store_id`,`platform`,`account_id`,`campaign_id`,`day`),
	CONSTRAINT `fk_ad_spend_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_profiles` (
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`presence` enum('offline','online','break') NOT NULL DEFAULT 'offline',
	`presence_at` datetime(3),
	`last_seen_at` datetime(3),
	`daily_cap` int,
	`weight` tinyint NOT NULL DEFAULT 1,
	`rr_credit` int NOT NULL DEFAULT 0,
	`languages` longtext,
	`skills` longtext,
	`commission_rule_ids` longtext,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `agent_profiles_store_id_user_id_pk` PRIMARY KEY(`store_id`,`user_id`),
	KEY `ap_presence_idx` (`store_id`,`presence`),
	CONSTRAINT `fk_agent_profiles_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_stats_daily` (
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`day` date NOT NULL,
	`worked` int NOT NULL DEFAULT 0,
	`confirmed` int NOT NULL DEFAULT 0,
	`cancelled` int NOT NULL DEFAULT 0,
	`fake` int NOT NULL DEFAULT 0,
	`duplicates` int NOT NULL DEFAULT 0,
	`attempts` int NOT NULL DEFAULT 0,
	`reveals` int NOT NULL DEFAULT 0,
	`first_touch_ms_sum` bigint NOT NULL DEFAULT 0,
	`first_touch_n` int NOT NULL DEFAULT 0,
	`handling_ms_sum` bigint NOT NULL DEFAULT 0,
	`shipped` int NOT NULL DEFAULT 0,
	`delivered` int NOT NULL DEFAULT 0,
	`refused` int NOT NULL DEFAULT 0,
	`returned` int NOT NULL DEFAULT 0,
	`decided` int NOT NULL DEFAULT 0,
	`unreachable` int NOT NULL DEFAULT 0,
	`callbacks` int NOT NULL DEFAULT 0,
	`lost` int NOT NULL DEFAULT 0,
	`abandoned` int NOT NULL DEFAULT 0,
	`upsells` int NOT NULL DEFAULT 0,
	`upsell_cents` bigint NOT NULL DEFAULT 0,
	`online_ms` bigint NOT NULL DEFAULT 0,
	CONSTRAINT `agent_stats_daily_store_id_user_id_day_pk` PRIMARY KEY(`store_id`,`user_id`,`day`),
	KEY `asd_store_day_idx` (`store_id`,`day`),
	CONSTRAINT `fk_agent_stats_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_batch_items` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26),
	`batch_id` varchar(26),
	`task` varchar(32) NOT NULL,
	`ref_kind` varchar(24) NOT NULL,
	`ref_id` varchar(64) NOT NULL,
	`dedupe` char(64),
	`payload` longtext NOT NULL,
	`prompt_version` varchar(32) NOT NULL,
	`model` varchar(64) NOT NULL,
	`state` enum('queued','submitted','succeeded','errored','refused','expired','canceled','ingested','dropped') NOT NULL DEFAULT 'queued',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`reserved_credits` int NOT NULL DEFAULT 0,
	`run_id` varchar(26),
	`eval_run_id` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_batch_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `abi_dedupe_uq` UNIQUE(`dedupe`),
	KEY `abi_state_idx` (`state`,`created_at`),
	KEY `abi_batch_idx` (`batch_id`),
	KEY `abi_store_idx` (`store_id`,`state`),
	CONSTRAINT `fk_ai_batch_items_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_batches` (
	`id` varchar(26) NOT NULL,
	`provider_batch_id` varchar(64),
	`kind` enum('eval','seo','alt','translate','describe','distill','insights','health','exemplars','screen','deep','mixed') NOT NULL,
	`model` varchar(64) NOT NULL,
	`status` enum('building','submitted','in_progress','canceling','ended','failed','expired') NOT NULL DEFAULT 'building',
	`items` int NOT NULL DEFAULT 0,
	`succeeded` int NOT NULL DEFAULT 0,
	`errored` int NOT NULL DEFAULT 0,
	`expired` int NOT NULL DEFAULT 0,
	`canceled` int NOT NULL DEFAULT 0,
	`cost_micros` bigint NOT NULL DEFAULT 0,
	`ingested_items` int NOT NULL DEFAULT 0,
	`submitted_at` datetime(3),
	`ended_at` datetime(3),
	`ingested_at` datetime(3),
	`error` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `ab_provider_uq` UNIQUE(`provider_batch_id`),
	KEY `ab_status_idx` (`status`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_cache` (
	`store_id` varchar(26) NOT NULL,
	`task` varchar(32) NOT NULL,
	`input_hash` char(64) NOT NULL,
	`prompt_version` varchar(32) NOT NULL,
	`model` varchar(64) NOT NULL,
	`output` longtext NOT NULL,
	`bytes` int NOT NULL,
	`hits` int NOT NULL DEFAULT 0,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_cache_store_id_task_input_hash_prompt_version_model_pk` PRIMARY KEY(`store_id`,`task`,`input_hash`,`prompt_version`,`model`),
	KEY `aic_exp_idx` (`expires_at`),
	CONSTRAINT `fk_ai_cache_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_eval_runs` (
	`id` varchar(26) NOT NULL,
	`kind` enum('offline','smoke','live','calibration','preference') NOT NULL,
	`task` varchar(32) NOT NULL,
	`model` varchar(64),
	`prompt_version` varchar(32) NOT NULL,
	`rubric_version` varchar(16),
	`fixtures_hash` char(64) NOT NULL,
	`baseline_version` varchar(32),
	`baseline_run_id` varchar(26),
	`judge_model` varchar(64),
	`judge_version` varchar(32),
	`judge_cost_micros` bigint NOT NULL DEFAULT 0,
	`status` enum('pending','oracle','running','scoring','done','failed','canceled') NOT NULL DEFAULT 'pending',
	`scores` longtext,
	`pairwise` longtext,
	`gate` longtext,
	`passed` boolean,
	`cost_micros` bigint NOT NULL DEFAULT 0,
	`report` longtext,
	`errors` int NOT NULL DEFAULT 0,
	`started_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `ai_eval_runs_id` PRIMARY KEY(`id`),
	KEY `aer_task_idx` (`task`,`prompt_version`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_jobs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`kind` enum('director_deep','store_blueprint','logo_system','health_report') NOT NULL,
	`task` varchar(32) NOT NULL,
	`status` enum('queued','running','done','failed','cancelled') NOT NULL DEFAULT 'queued',
	`active` char(1),
	`stage` varchar(24),
	`input_hash` char(64) NOT NULL,
	`progress` longtext,
	`stage_attempts` tinyint NOT NULL DEFAULT 0,
	`driver` enum('after','poll','cron','batch'),
	`lease_until` datetime(3),
	`heartbeat_at` datetime(3),
	`attempts` tinyint NOT NULL DEFAULT 0,
	`class` enum('director_deep','director_interactive') NOT NULL DEFAULT 'director_deep',
	`model` varchar(64),
	`effort` varchar(8),
	`transport` enum('job','batch') NOT NULL DEFAULT 'job',
	`result` longtext,
	`error` varchar(200),
	`cost_micros` bigint,
	`reserved_credits` int,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `ai_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `aj_active_uq` UNIQUE(`store_id`,`input_hash`,`active`),
	KEY `aj_store_idx` (`store_id`,`status`,`created_at`),
	KEY `aj_orphan_idx` (`status`,`heartbeat_at`),
	CONSTRAINT `fk_ai_jobs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_memory` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`kind` enum('voice','fact','avoid','prefer','policy') NOT NULL,
	`text` varchar(500) NOT NULL,
	`locale` varchar(5),
	`evidence` longtext,
	`source` enum('explicit','learned') NOT NULL DEFAULT 'explicit',
	`active` boolean NOT NULL DEFAULT true,
	`pinned` boolean NOT NULL DEFAULT false,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_memory_id` PRIMARY KEY(`id`),
	KEY `aim_store_idx` (`store_id`,`active`,`source`),
	CONSTRAINT `fk_ai_memory_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_runs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26),
	`task` varchar(32) NOT NULL,
	`surface` varchar(16) NOT NULL DEFAULT 'system',
	`provider` enum('server','local','library') NOT NULL,
	`via` enum('interactive','stream','batch','cache','report','job') NOT NULL,
	`class` enum('director_interactive','director_deep','worker','fast'),
	`stage` varchar(16),
	`job_id` varchar(26),
	`requested_model` varchar(64),
	`model` varchar(64),
	`effort` varchar(8),
	`speed` enum('standard','fast'),
	`prompt_version` varchar(32),
	`rubric_version` varchar(16),
	`input_hash` char(64) NOT NULL,
	`locale` varchar(5),
	`status` enum('running','ok','refused','invalid_output','max_tokens','timeout','error','cancelled','quota','blocked') NOT NULL,
	`error_code` varchar(40),
	`output` longtext,
	`rejected_fields` longtext,
	`stop_reason` varchar(48),
	`flags` longtext,
	`ms` int NOT NULL,
	`ttft_ms` int,
	`in_tok` int,
	`out_tok` int,
	`cache_read_tok` int,
	`cache_write_tok` int,
	`cost_micros` bigint,
	`credits` int,
	`reserved_credits` int,
	`reconciled_at` datetime(3),
	`batch_item_id` varchar(26),
	`parent_run_id` varchar(26),
	`ref_kind` varchar(24),
	`ref_id` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_runs_id` PRIMARY KEY(`id`),
	KEY `air_store_idx` (`store_id`,`created_at`),
	KEY `air_task_idx` (`task`,`prompt_version`,`created_at`),
	KEY `air_store_task_idx` (`store_id`,`task`,`created_at`),
	KEY `air_open_idx` (`status`,`created_at`),
	KEY `air_ref_idx` (`store_id`,`ref_kind`,`ref_id`),
	KEY `air_job_idx` (`store_id`,`job_id`),
	CONSTRAINT `fk_ai_runs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_usage_daily` (
	`store_id` varchar(26) NOT NULL,
	`day` date NOT NULL,
	`task` varchar(32) NOT NULL,
	`provider` enum('server','local','library') NOT NULL,
	`model` varchar(64) NOT NULL DEFAULT '',
	`runs` int NOT NULL DEFAULT 0,
	`ok` int NOT NULL DEFAULT 0,
	`refused` int NOT NULL DEFAULT 0,
	`fallbacks` int NOT NULL DEFAULT 0,
	`invalid` int NOT NULL DEFAULT 0,
	`errors` int NOT NULL DEFAULT 0,
	`cache_hits` int NOT NULL DEFAULT 0,
	`rejected_fields` int NOT NULL DEFAULT 0,
	`in_tok` bigint NOT NULL DEFAULT 0,
	`out_tok` bigint NOT NULL DEFAULT 0,
	`cache_read_tok` bigint NOT NULL DEFAULT 0,
	`cache_write_tok` bigint NOT NULL DEFAULT 0,
	`cost_micros` bigint NOT NULL DEFAULT 0,
	`credits` int NOT NULL DEFAULT 0,
	`ms_sum` bigint NOT NULL DEFAULT 0,
	`ms_hist` longtext,
	CONSTRAINT `ai_usage_daily_store_id_day_task_provider_model_pk` PRIMARY KEY(`store_id`,`day`,`task`,`provider`,`model`),
	KEY `aud_day_idx` (`day`),
	CONSTRAINT `fk_ai_usage_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `backup_runs` (
	`id` varchar(26) NOT NULL,
	`kind` enum('daily','weekly') NOT NULL,
	`day` date NOT NULL,
	`state` enum('running','done','failed','pruned') NOT NULL,
	`cursor` longtext,
	`manifest` longtext,
	`bytes` bigint,
	`started_at` datetime(3) NOT NULL,
	`done_at` datetime(3),
	`error` varchar(200),
	CONSTRAINT `backup_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `br_kind_day_uq` UNIQUE(`kind`,`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campaigns` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(40) NOT NULL,
	`page_id` varchar(26) NOT NULL,
	`page_version_id` varchar(26),
	`product_ref` longtext NOT NULL,
	`channels` longtext NOT NULL,
	`kit` longtext NOT NULL,
	`kit_source` enum('library','cloud') NOT NULL DEFAULT 'library',
	`offers_hash` char(16) NOT NULL,
	`share_token_hash` char(64),
	`status` enum('draft','live','paused','ended') NOT NULL DEFAULT 'draft',
	`starts_at` datetime(3),
	`ends_at` datetime(3),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `cp_store_slug_uq` UNIQUE(`store_id`,`slug`),
	CONSTRAINT `cp_share_uq` UNIQUE(`share_token_hash`),
	KEY `cp_store_page_idx` (`store_id`,`page_id`),
	CONSTRAINT `fk_campaigns_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `carrier_rates` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`carrier_account_id` varchar(26) NOT NULL DEFAULT '',
	`city_key` varchar(40) NOT NULL,
	`delivery_fee_cents` bigint,
	`return_fee_cents` bigint,
	`cod_fee_bp` int NOT NULL DEFAULT 0,
	`cod_fee_min_cents` bigint,
	`cod_fee_flat_cents` bigint NOT NULL DEFAULT 0,
	`eta_days` tinyint,
	`active` boolean NOT NULL DEFAULT true,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `carrier_rates_id` PRIMARY KEY(`id`),
	CONSTRAINT `cr_uq` UNIQUE(`store_id`,`carrier_account_id`,`city_key`),
	CONSTRAINT `fk_carrier_rates_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cron_cursors` (
	`job` varchar(48) NOT NULL,
	`cursor` varchar(64) NOT NULL DEFAULT '',
	`state` longtext,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `cron_cursors_job` PRIMARY KEY(`job`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customers` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`phone` varchar(24) NOT NULL,
	`name` varchar(120),
	`city` varchar(120),
	`city_key` varchar(40),
	`locale` varchar(5),
	`orders_count` int NOT NULL DEFAULT 0,
	`confirmed_count` int NOT NULL DEFAULT 0,
	`delivered_count` int NOT NULL DEFAULT 0,
	`refused_count` int NOT NULL DEFAULT 0,
	`returned_count` int NOT NULL DEFAULT 0,
	`cancelled_count` int NOT NULL DEFAULT 0,
	`fake_count` int NOT NULL DEFAULT 0,
	`test_count` int NOT NULL DEFAULT 0,
	`first_order_at` datetime(3),
	`last_order_at` datetime(3),
	`last_order_id` varchar(20),
	`note` varchar(300),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `cu_store_phone_uq` UNIQUE(`store_id`,`phone`),
	KEY `cu_store_last_idx` (`store_id`,`last_order_at`),
	KEY `cu_phone_idx` (`phone`),
	CONSTRAINT `fk_customers_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `delivery_zones` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`name` varchar(80) NOT NULL,
	`cities` longtext NOT NULL,
	`fee_cents` bigint,
	`free_from_cents` bigint,
	`eta_min_days` tinyint,
	`eta_max_days` tinyint,
	`not_served` boolean NOT NULL DEFAULT false,
	`note` varchar(120),
	`position` int NOT NULL DEFAULT 0,
	`updated_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `delivery_zones_id` PRIMARY KEY(`id`),
	KEY `dz_store_idx` (`store_id`,`position`),
	CONSTRAINT `fk_delivery_zones_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `design_genomes` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`page_id` varchar(26),
	`version_id` varchar(26),
	`kind` enum('brand','page') NOT NULL,
	`source` enum('generated','chosen','published','derived','theme') NOT NULL,
	`niche` varchar(64) NOT NULL,
	`bucket` varchar(96) NOT NULL,
	`genome_v` tinyint NOT NULL DEFAULT 1,
	`vec` longtext NOT NULL,
	`genome` longtext NOT NULL,
	`seed` int NOT NULL,
	`priors_v` varchar(24) NOT NULL DEFAULT 'p1',
	`first_published_at` datetime(3),
	`q` tinyint,
	`slop` tinyint,
	`report` longtext,
	`novelty` longtext,
	`live` boolean NOT NULL DEFAULT false,
	`pool` boolean NOT NULL DEFAULT false,
	`reserved_until` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `design_genomes_id` PRIMARY KEY(`id`),
	KEY `dg_bucket_idx` (`bucket`,`live`),
	KEY `dg_store_idx` (`store_id`,`page_id`),
	KEY `dg_niche_idx` (`niche`,`live`),
	KEY `dg_pool_idx` (`pool`,`updated_at`),
	KEY `dg_store_kind_idx` (`store_id`,`kind`,`created_at`),
	KEY `dg_version_idx` (`store_id`,`version_id`),
	CONSTRAINT `fk_design_genomes_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `error_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`dedupe` char(64) NOT NULL,
	`bucket` char(13) NOT NULL,
	`area` varchar(32) NOT NULL,
	`code` varchar(64) NOT NULL,
	`route` varchar(120),
	`store_id` varchar(26),
	`count` int NOT NULL DEFAULT 1,
	`first_at` datetime(3) NOT NULL,
	`last_at` datetime(3) NOT NULL,
	`sample` longtext,
	CONSTRAINT `error_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `ee_dedupe_uq` UNIQUE(`dedupe`),
	KEY `ee_bucket_idx` (`bucket`),
	KEY `ee_store_idx` (`store_id`,`last_at`),
	CONSTRAINT `fk_error_events_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `export_jobs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`kind` enum('store_export') NOT NULL DEFAULT 'store_export',
	`requested_by` varchar(26) NOT NULL,
	`requested_as` enum('member','platform') NOT NULL,
	`state` enum('pending','running','ready','failed','expired') NOT NULL DEFAULT 'pending',
	`cursor` longtext,
	`parts` longtext,
	`bytes` bigint,
	`expires_at` datetime(3),
	`error` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `export_jobs_id` PRIMARY KEY(`id`),
	KEY `ej_store_idx` (`store_id`,`created_at`),
	KEY `ej_state_idx` (`state`,`created_at`),
	CONSTRAINT `fk_export_jobs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `headline_shingles` (
	`niche_key` varchar(64) NOT NULL,
	`hash` char(16) NOT NULL,
	`owner_tag` char(16) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`kind` enum('title','lead') NOT NULL DEFAULT 'title',
	CONSTRAINT `headline_shingles_niche_key_hash_owner_tag_pk` PRIMARY KEY(`niche_key`,`hash`,`owner_tag`),
	KEY `hs_owner_idx` (`owner_tag`),
	KEY `hs_niche_owner_idx` (`niche_key`,`owner_tag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `integration_status` (
	`store_id` varchar(26) NOT NULL,
	`kind` enum('sheets','capi','telegram','whatsapp','webhook','carrier') NOT NULL,
	`target_id` varchar(64) NOT NULL DEFAULT '',
	`state` enum('ok','warn','failing','off') NOT NULL,
	`last_ok_at` datetime(3),
	`last_error_at` datetime(3),
	`last_error_code` varchar(48),
	`failures` int NOT NULL DEFAULT 0,
	`backlog` int NOT NULL DEFAULT 0,
	`oldest_pending_at` datetime(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `integration_status_store_id_kind_target_id_pk` PRIMARY KEY(`store_id`,`kind`,`target_id`),
	KEY `is_state_idx` (`state`,`kind`),
	CONSTRAINT `fk_integration_status_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_runs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`job` varchar(48) NOT NULL,
	`store_id` varchar(26),
	`tick_id` char(26),
	`started_at` datetime(3) NOT NULL,
	`ms` int NOT NULL,
	`ok` boolean NOT NULL,
	`processed` int NOT NULL DEFAULT 0,
	`summary` longtext,
	`error_code` varchar(64),
	CONSTRAINT `job_runs_id` PRIMARY KEY(`id`),
	KEY `jr_job_idx` (`job`,`started_at`),
	KEY `jr_started_idx` (`started_at`),
	KEY `jr_store_idx` (`store_id`,`started_at`),
	CONSTRAINT `fk_job_runs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `message_templates` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`channel` enum('whatsapp','telegram','sms','email','call_script') NOT NULL,
	`kind` varchar(40) NOT NULL,
	`locale` varchar(5) NOT NULL,
	`page_id` varchar(26),
	`name` varchar(80) NOT NULL,
	`body` text NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'active',
	`source` enum('user','ai') NOT NULL DEFAULT 'user',
	`prompt_version` varchar(32),
	`position` int NOT NULL DEFAULT 0,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `message_templates_id` PRIMARY KEY(`id`),
	KEY `mt_store_idx` (`store_id`,`channel`,`kind`,`locale`),
	CONSTRAINT `fk_message_templates_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`order_id` varchar(20) NOT NULL,
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`actor_kind` enum('user','system','customer','sheet','carrier','api','platform','bot') NOT NULL,
	`actor_id` varchar(26),
	`type` varchar(32) NOT NULL,
	`from_state` varchar(24),
	`to_state` varchar(24),
	`reason_code` varchar(32),
	`note` varchar(500),
	`meta` longtext,
	`rev` int,
	CONSTRAINT `order_events_id` PRIMARY KEY(`id`),
	KEY `oe_order_idx` (`store_id`,`order_id`,`at`),
	KEY `oe_actor_idx` (`store_id`,`actor_id`,`at`),
	KEY `oe_type_idx` (`store_id`,`type`,`at`),
	CONSTRAINT `fk_order_events_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `outbox` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26),
	`kind` enum('webhook','capi','telegram','whatsapp','mail','carrier') NOT NULL,
	`topic` varchar(48) NOT NULL,
	`target_id` varchar(64),
	`dedupe_key` varchar(160) NOT NULL,
	`payload` longtext NOT NULL,
	`encrypted` boolean NOT NULL DEFAULT false,
	`state` enum('pending','running','done','dead','cancelled') NOT NULL DEFAULT 'pending',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`next_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`lease_until` datetime(3),
	`claim` char(26),
	`last_status` int,
	`last_error` varchar(300),
	`last_ms` int,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `outbox_id` PRIMARY KEY(`id`),
	CONSTRAINT `ob_dedupe_uq` UNIQUE(`dedupe_key`),
	KEY `ob_due_idx` (`state`,`next_at`),
	KEY `ob_store_idx` (`store_id`,`state`,`next_at`),
	KEY `ob_claim_idx` (`claim`),
	CONSTRAINT `fk_outbox_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_notes` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26),
	`user_id` varchar(26),
	`author_id` varchar(26) NOT NULL,
	`body` text NOT NULL,
	`pinned` boolean NOT NULL DEFAULT false,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`kind` enum('note','decision','warning') NOT NULL DEFAULT 'note',
	`mentions` longtext,
	`edited_at` datetime(3),
	`deleted_at` datetime(3),
	CONSTRAINT `platform_notes_id` PRIMARY KEY(`id`),
	KEY `pn_store_idx` (`store_id`,`created_at`),
	KEY `pn_user_idx` (`user_id`,`created_at`),
	CONSTRAINT `fk_platform_notes_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `platform_requests` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26),
	`kind` enum('store_purge','staff_super_admin') NOT NULL,
	`mode` enum('four_eyes','delayed') NOT NULL,
	`payload` longtext NOT NULL,
	`reason_code` varchar(40) NOT NULL,
	`reason_note` varchar(500),
	`status` enum('pending','confirmed','executed','cancelled','expired') NOT NULL DEFAULT 'pending',
	`requested_by` varchar(26) NOT NULL,
	`requested_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`execute_after` datetime(3),
	`confirmed_by` varchar(26),
	`confirmed_at` datetime(3),
	`cancelled_by` varchar(26),
	`cancelled_at` datetime(3),
	`executed_at` datetime(3),
	`error` varchar(200),
	CONSTRAINT `platform_requests_id` PRIMARY KEY(`id`),
	KEY `preq_due_idx` (`status`,`execute_after`),
	KEY `preq_store_idx` (`store_id`,`status`),
	CONSTRAINT `preq_four_eyes_ck` CHECK (`confirmed_by` <> `requested_by`),
	CONSTRAINT `fk_platform_requests_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `product_costs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`product_id` varchar(26),
	`page_id` varchar(26),
	`item_id` varchar(40),
	`sku` varchar(64),
	`variant_key` varchar(120) NOT NULL DEFAULT '',
	`cost_cents` bigint NOT NULL,
	`packaging_cents` bigint,
	`effective_from` datetime(3) NOT NULL,
	`note` varchar(200),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `product_costs_id` PRIMARY KEY(`id`),
	KEY `pc_prod_idx` (`store_id`,`product_id`,`item_id`,`variant_key`,`effective_from`),
	KEY `pc_page_idx` (`store_id`,`page_id`,`item_id`,`variant_key`,`effective_from`),
	KEY `pc_sku_idx` (`store_id`,`sku`,`variant_key`,`effective_from`),
	CONSTRAINT `fk_product_costs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `profit_alerts` (
	`store_id` varchar(26) NOT NULL,
	`kind` varchar(32) NOT NULL,
	`key` varchar(80) NOT NULL DEFAULT '',
	`fired_at` datetime(3) NOT NULL,
	`cleared_at` datetime(3),
	`evidence` longtext NOT NULL,
	CONSTRAINT `profit_alerts_store_id_kind_key_fired_at_pk` PRIMARY KEY(`store_id`,`kind`,`key`,`fired_at`),
	KEY `pa_open_idx` (`store_id`,`cleared_at`),
	CONSTRAINT `fk_profit_alerts_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `prompt_versions` (
	`task` varchar(32) NOT NULL,
	`version` varchar(32) NOT NULL,
	`provider` enum('server','local') NOT NULL,
	`template_hash` char(64) NOT NULL,
	`rubric_version` varchar(16),
	`status` enum('draft','canary','active','retired') NOT NULL DEFAULT 'draft',
	`eval_score` longtext,
	`eval_run_id` varchar(26),
	`baseline_version` varchar(32),
	`canary_bp` smallint NOT NULL DEFAULT 0,
	`canary_started_at` datetime(3),
	`canary_runs` int NOT NULL DEFAULT 0,
	`rolled_back_at` datetime(3),
	`rollback_reason` varchar(120),
	`notes` varchar(300),
	`activated_at` datetime(3),
	`activated_by` varchar(26),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `prompt_versions_task_version_pk` PRIMARY KEY(`task`,`version`),
	KEY `pv_status_idx` (`status`,`canary_started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `render_jobs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`page_id` varchar(26) NOT NULL,
	`reason` enum('address','theme','brand','product','republish','runtime','experiment','store_info','conversions','cutout') NOT NULL,
	`priority` tinyint NOT NULL DEFAULT 5,
	`dedupe` varchar(40),
	`state` enum('pending','running','done','failed','skipped') NOT NULL DEFAULT 'pending',
	`attempts` tinyint NOT NULL DEFAULT 0,
	`not_before` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`lease_until` datetime(3),
	`claim` char(26),
	`error` varchar(200),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`done_at` datetime(3),
	CONSTRAINT `render_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `rj_dedupe_uq` UNIQUE(`dedupe`),
	KEY `rj_due_idx` (`state`,`priority`,`not_before`),
	KEY `rj_store_idx` (`store_id`,`state`),
	CONSTRAINT `fk_render_jobs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `saved_views` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26),
	`surface` enum('orders','leads','customers') NOT NULL,
	`name` varchar(60) NOT NULL,
	`query` longtext NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `saved_views_id` PRIMARY KEY(`id`),
	KEY `sv_store_idx` (`store_id`,`surface`,`user_id`),
	CONSTRAINT `fk_saved_views_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sheet_bindings` (
	`spreadsheet_id` varchar(100) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`method` enum('code','legacy') NOT NULL DEFAULT 'code',
	`verified_at` datetime(3) NOT NULL,
	`verified_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `sheet_bindings_spreadsheet_id` PRIMARY KEY(`spreadsheet_id`),
	KEY `sb_store_idx` (`store_id`),
	CONSTRAINT `fk_sheet_bindings_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `short_links` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`code` varchar(16) NOT NULL,
	`target_kind` enum('page','home','policy','product','collection') NOT NULL DEFAULT 'page',
	`page_id` varchar(26),
	`target_ref` varchar(26),
	`campaign_id` varchar(26),
	`utm` longtext,
	`channel` enum('meta','tiktok','snap','google','whatsapp','instagram','organic','print','other'),
	`status` enum('active','paused') NOT NULL DEFAULT 'active',
	`clicks` int NOT NULL DEFAULT 0,
	`last_click_at` datetime(3),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `short_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `sl_store_code_uq` UNIQUE(`store_id`,`code`),
	KEY `sl_store_page_idx` (`store_id`,`page_id`),
	KEY `sl_store_campaign_idx` (`store_id`,`campaign_id`),
	CONSTRAINT `fk_short_links_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_invites` (
	`id` varchar(26) NOT NULL,
	`email_norm` varchar(191) NOT NULL,
	`role` enum('admin','support','analyst') NOT NULL,
	`token_hash` char(64) NOT NULL,
	`invited_by` varchar(26) NOT NULL,
	`note` varchar(200),
	`expires_at` datetime(3) NOT NULL,
	`accepted_at` datetime(3),
	`accepted_by` varchar(26),
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `staff_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `sti_token_uq` UNIQUE(`token_hash`),
	KEY `sti_email_idx` (`email_norm`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_health` (
	`store_id` varchar(26) NOT NULL,
	`score` tinyint NOT NULL,
	`attention` tinyint NOT NULL DEFAULT 0,
	`flags` longtext NOT NULL,
	`issues` longtext NOT NULL,
	`components` longtext NOT NULL,
	`metrics` longtext NOT NULL,
	`milestones` longtext,
	`snoozed` longtext,
	`dormant` boolean NOT NULL DEFAULT false,
	`computed_at` datetime(3) NOT NULL,
	`dirty_at` datetime(3),
	CONSTRAINT `store_health_store_id` PRIMARY KEY(`store_id`),
	KEY `sh_attention_idx` (`attention`,`score`),
	KEY `sh_due_idx` (`dirty_at`,`computed_at`),
	CONSTRAINT `fk_store_health_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
-- 2. Seed (§H.2, rev 5 CRIT2-18): the tick lease row. cursor = the running tickId or '', updated_at = the lease time;
-- INSERT IGNORE, so a rerun never resets a lease a running tick holds.
INSERT IGNORE INTO `cron_cursors` (`job`, `cursor`, `state`, `updated_at`) VALUES ('tick', '', NULL, UTC_TIMESTAMP(3));--> statement-breakpoint
-- 3. users (§D.2 0005): the console people list (PLA Q.10), platform code only.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `users_name_idx` ON `users` (`name`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_name_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 4. page_versions (§D.2 0005): which AI tier produced the published doc and the critic's picks (ai owns the values).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `page_versions` ADD `generation_source` enum(''manual'',''instant'',''director'',''deep'')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'generation_source');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `page_versions` ADD `critic_picks` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'critic_picks');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 5. orders (§D.2 0005; OPE-§2.1): the state axes, the claim queue, the call-center and carrier-loop columns as ONE wide
-- row (§D.8 rev 3, ENGC-34: one information_schema count; when every column is missing, a single ALTER, one rebuild
-- instead of one per column). attempt_failed / postponed are the last ship_state values (OPE Q.27a).
SET @present := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name IN ('confirm_state', 'ship_state', 'money_state', 'assignee_id', 'lease_until', 'claim_token', 'due_at', 'attempts', 'priority', 'cancel_reason', 'customer_id', 'merged_into', 'city_key', 'created_by', 'rev', 'confirmed_by', 'confirmed_at', 'first_touch_at', 'shipped_at', 'delivered_at', 'final_at', 'landmark', 'adjust_cents', 'sheet_label', 'sheet_dirty', 'capi_ctx', 'tracking_ref', 'carrier_label', 'ship_after', 'delivery_attempts', 'return_reason', 'confirmed_by_label'));--> statement-breakpoint
SET @ddl := IF(@present = 0, 'ALTER TABLE `orders` ADD `confirm_state` enum(''new'',''attempting'',''callback'',''confirmed'',''cancelled'',''fake'',''duplicate'',''unreachable'') NOT NULL DEFAULT ''new'', ADD `ship_state` enum(''none'',''to_pack'',''packed'',''shipped'',''in_transit'',''out_for_delivery'',''delivered'',''refused'',''returned'',''lost'',''attempt_failed'',''postponed'') NOT NULL DEFAULT ''none'', ADD `money_state` enum(''unpaid'',''collected'',''remitted'',''disputed'',''written_off'') NOT NULL DEFAULT ''unpaid'', ADD `assignee_id` varchar(26), ADD `lease_until` datetime(3), ADD `claim_token` char(26), ADD `due_at` datetime(3), ADD `attempts` tinyint NOT NULL DEFAULT 0, ADD `priority` int NOT NULL DEFAULT 0, ADD `cancel_reason` varchar(32), ADD `customer_id` varchar(26), ADD `merged_into` varchar(20), ADD `city_key` varchar(40), ADD `created_by` varchar(26), ADD `rev` int NOT NULL DEFAULT 0, ADD `confirmed_by` varchar(26), ADD `confirmed_at` datetime(3), ADD `first_touch_at` datetime(3), ADD `shipped_at` datetime(3), ADD `delivered_at` datetime(3), ADD `final_at` datetime(3), ADD `landmark` varchar(160), ADD `adjust_cents` bigint NOT NULL DEFAULT 0, ADD `sheet_label` varchar(20), ADD `sheet_dirty` tinyint NOT NULL DEFAULT 0, ADD `capi_ctx` text, ADD `tracking_ref` varchar(64), ADD `carrier_label` varchar(60), ADD `ship_after` datetime(3), ADD `delivery_attempts` tinyint NOT NULL DEFAULT 0, ADD `return_reason` varchar(32), ADD `confirmed_by_label` varchar(60)', 'DO 0');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- orders: the per-column fallback when an earlier run left only some of the 32 columns (each a no-op after the batched ALTER).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `confirm_state` enum(''new'',''attempting'',''callback'',''confirmed'',''cancelled'',''fake'',''duplicate'',''unreachable'') NOT NULL DEFAULT ''new''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirm_state');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `ship_state` enum(''none'',''to_pack'',''packed'',''shipped'',''in_transit'',''out_for_delivery'',''delivered'',''refused'',''returned'',''lost'',''attempt_failed'',''postponed'') NOT NULL DEFAULT ''none''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'ship_state');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `money_state` enum(''unpaid'',''collected'',''remitted'',''disputed'',''written_off'') NOT NULL DEFAULT ''unpaid''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'money_state');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `assignee_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'assignee_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `lease_until` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'lease_until');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `claim_token` char(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'claim_token');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `due_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'due_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `attempts` tinyint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'attempts');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `priority` int NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'priority');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `cancel_reason` varchar(32)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'cancel_reason');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `customer_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'customer_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `merged_into` varchar(20)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'merged_into');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `city_key` varchar(40)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'city_key');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `created_by` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'created_by');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `rev` int NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'rev');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `confirmed_by` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirmed_by');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `confirmed_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirmed_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `first_touch_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'first_touch_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `shipped_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'shipped_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `delivered_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'delivered_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `final_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'final_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `landmark` varchar(160)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'landmark');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `adjust_cents` bigint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'adjust_cents');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `sheet_label` varchar(20)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'sheet_label');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `sheet_dirty` tinyint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'sheet_dirty');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `capi_ctx` text', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'capi_ctx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `tracking_ref` varchar(64)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'tracking_ref');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `carrier_label` varchar(60)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'carrier_label');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `ship_after` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'ship_after');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `delivery_attempts` tinyint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'delivery_attempts');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `return_reason` varchar(32)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'return_reason');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `confirmed_by_label` varchar(60)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'confirmed_by_label');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- orders.source: D42 appends manual, api, storefront, whatsapp after live, export, php (the stored values keep their
-- order and meaning). MODIFY only while the column still has exactly the R1.0 type.
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `orders` MODIFY `source` enum(''live'',''export'',''php'',''manual'',''api'',''storefront'',''whatsapp'') NOT NULL DEFAULT ''live''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'source' AND column_type = 'enum(''live'',''export'',''php'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- orders indexes (§D.2 0005): store-first, and the one cross-store orders_created_idx (the console order lookup).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_queue_idx` ON `orders` (`store_id`,`confirm_state`,`due_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_queue_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_assignee_idx` ON `orders` (`store_id`,`assignee_id`,`confirm_state`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_assignee_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_customer_idx` ON `orders` (`store_id`,`customer_id`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_customer_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_ship_idx` ON `orders` (`store_id`,`ship_state`,`updated_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_ship_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_confirmer_idx` ON `orders` (`store_id`,`confirmed_by`,`confirmed_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_confirmer_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_money_idx` ON `orders` (`store_id`,`money_state`,`delivered_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_money_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_dirty_idx` ON `orders` (`store_id`,`sheet_dirty`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_dirty_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_tracking_idx` ON `orders` (`store_id`,`tracking_ref`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_tracking_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `orders_created_idx` ON `orders` (`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'orders' AND index_name = 'orders_created_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 6. leads (§D.2 0005; LAN-§2.1): the one guarded type change of 0005 (rev 3, ENGC-17): phone → NULL-able, MODIFY only
-- while the column is still NOT NULL (a WhatsApp intent has no phone until the chat starts, LAN Q2).
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `leads` MODIFY `phone` varchar(24) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'phone' AND is_nullable = 'NO');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- leads: the inbox and WhatsApp-intent columns, the same batched form as orders.
SET @present := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name IN ('status', 'assignee_id', 'contacted_at', 'attempts', 'note', 'kind', 'ref', 'sel', 'total_cents', 'version_id', 'next_at', 'lost_reason', 'converted_via', 'updated_at'));--> statement-breakpoint
SET @ddl := IF(@present = 0, 'ALTER TABLE `leads` ADD `status` enum(''new'',''contacted'',''recovered'',''lost'',''converted'') NOT NULL DEFAULT ''new'', ADD `assignee_id` varchar(26), ADD `contacted_at` datetime(3), ADD `attempts` tinyint NOT NULL DEFAULT 0, ADD `note` varchar(300), ADD `kind` enum(''form'',''whatsapp'') NOT NULL DEFAULT ''form'', ADD `ref` char(9), ADD `sel` longtext, ADD `total_cents` bigint, ADD `version_id` varchar(26), ADD `next_at` datetime(3), ADD `lost_reason` varchar(32), ADD `converted_via` enum(''idem'',''phone'',''agent''), ADD `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- leads: the per-column fallback when an earlier run left only some of the 14 columns (each a no-op after the batched ALTER).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `status` enum(''new'',''contacted'',''recovered'',''lost'',''converted'') NOT NULL DEFAULT ''new''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'status');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `assignee_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'assignee_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `contacted_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'contacted_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `attempts` tinyint NOT NULL DEFAULT 0', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'attempts');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `note` varchar(300)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'note');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `kind` enum(''form'',''whatsapp'') NOT NULL DEFAULT ''form''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'kind');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `ref` char(9)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'ref');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `sel` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'sel');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `total_cents` bigint', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'total_cents');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `version_id` varchar(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'version_id');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `next_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'next_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `lost_reason` varchar(32)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'lost_reason');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `converted_via` enum(''idem'',''phone'',''agent'')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'converted_via');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `leads` ADD `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'updated_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- leads indexes (§D.2 0005): leads_store_ref_uq allows several NULL refs (every form lead).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE UNIQUE INDEX `leads_store_ref_uq` ON `leads` (`store_id`,`ref`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_ref_uq');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `leads_store_status_idx` ON `leads` (`store_id`,`status`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_status_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `leads_store_phone_idx` ON `leads` (`store_id`,`phone`,`created_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_phone_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `leads_store_assignee_idx` ON `leads` (`store_id`,`assignee_id`,`status`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_assignee_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'CREATE INDEX `leads_store_next_idx` ON `leads` (`store_id`,`next_at`)', 'DO 0') FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'leads' AND index_name = 'leads_store_next_idx');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;
