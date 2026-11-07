-- 0006 R2 (docs/STORE-SAAS.md §D.2, §D.6, §D.8, §K.4; R2 contract step C2-A): the R2 tables (storefront catalog,
-- store themes, carriers and shipments, reconciliation and imports, accounting, commissions, webhooks, the AI outcome
-- tables, notification preferences, the edge counters) and the 0006 columns, enum appends and type changes of pages,
-- page_versions, orders, leads, order_events, agent_profiles, ai_jobs and outbox. The cited part sections are the column
-- lists (§D.6, §D.9): STO-§3.1 … §3.3, DES-§2.3, OPE-§2.1 / §2.7, AI-§M.3, PLA-§2.3, plus the R2 plans' contract
-- requests (S1 catalog_from_photos, S3 import_runs context / committing, S4 shipments.batch_id, shipment_events dedupe,
-- agent_profiles reveal alarm, S5 webhook_endpoints.name, S6 edge_reports and outbox edge_purge, S7 the AI-§M.3
-- refinements, CCR r1-p7-9 ai_jobs.input / reservation, products.i18n / collections.i18n moved from 0007).
--
-- Guarded and idempotent like 0004 and 0005: MariaDB commits DDL implicitly, so drizzle's single transaction is not
-- atomic (node_modules/drizzle-orm/mysql-core/dialect.js); every statement is safe to run twice and to resume after a
-- crash at any statement. Additive only and safe on the live R1 database (§D.8 "0005-0007"): new tables, appended enum
-- values (the existing values keep their order and index), new NULL-able columns, and the guarded type changes of 0006
-- (orders.page_id and leads.page_id → NULL-able, ORD-19, STO-R9), each MODIFY only while the column still has its R1
-- type. No backfill, no CHECK constraint, no dropped column (the §D.2 users drop waits: the store #1 conversion, a boot
-- task that runs after every migration on a legacy install, still reads users.role). Portable SQL (MariaDB 10.4 and
-- MySQL 8): no ADD COLUMN IF NOT EXISTS, no SKIP LOCKED, no JSON type, no RETURNING.
-- The column, index and FK definitions are drizzle-kit's for src/lib/db/schema.ts (meta/0006_snapshot.json).

-- 1. Every new table, one CREATE each with its keys, uniques and FK inline, so a crash never leaves a table
-- half-indexed; IF NOT EXISTS makes a rerun skip what exists. Every tenant FK is fk_<table>_store (RESTRICT), served by
-- the table's first store_id index. notification_prefs (store_id '' = every store) and edge_reports (no store) have none.
CREATE TABLE IF NOT EXISTS `agent_earnings` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`ref` varchar(40) NOT NULL,
	`order_id` varchar(20),
	`rule_id` varchar(26) NOT NULL,
	`entry` enum('accrual','clawback','bonus','fixed') NOT NULL,
	`amount_cents` bigint NOT NULL,
	`state` enum('pending','earned','void','paid') NOT NULL DEFAULT 'pending',
	`period` char(7) NOT NULL,
	`payout_id` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `agent_earnings_id` PRIMARY KEY(`id`),
	CONSTRAINT `ae_uq` UNIQUE(`store_id`,`ref`,`rule_id`,`user_id`,`entry`),
	KEY `ae_user_idx` (`store_id`,`user_id`,`state`,`period`),
	CONSTRAINT `fk_agent_earnings_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_feedback` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`run_id` varchar(26),
	`page_id` varchar(26),
	`version_id` varchar(26),
	`field` varchar(80),
	`kind` enum('kept','edited','rejected','regenerated','chosen','not_chosen','shown','director_requested','repair_applied','repair_reverted','repair_rejected','published','unpublished','exemplar_used','memory_deleted','rewritten','reverted') NOT NULL,
	`before_text` varchar(1000),
	`after_text` varchar(1000),
	`edit_ratio_bp` int,
	`user_id` varchar(26),
	`surface` varchar(16),
	`locale` varchar(5),
	`genome_id` varchar(26),
	`direction_slot` enum('best_fit','contrast','explore'),
	`prompt_version` varchar(32),
	`context` longtext,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `ai_feedback_id` PRIMARY KEY(`id`),
	KEY `af_store_created_idx` (`store_id`,`created_at`),
	KEY `af_store_kind_idx` (`store_id`,`kind`,`created_at`),
	KEY `af_store_genome_idx` (`store_id`,`genome_id`,`kind`),
	KEY `af_store_page_idx` (`store_id`,`page_id`,`kind`),
	CONSTRAINT `fk_ai_feedback_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `carrier_accounts` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`adapter` varchar(32) NOT NULL,
	`label` varchar(60) NOT NULL,
	`status` enum('active','disabled') NOT NULL DEFAULT 'active',
	`settlement` enum('statement','at_delivery') NOT NULL DEFAULT 'statement',
	`hook_key_hash` char(64),
	`settings` longtext NOT NULL,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `carrier_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ca_label_uq` UNIQUE(`store_id`,`adapter`,`label`),
	CONSTRAINT `ca_hook_uq` UNIQUE(`hook_key_hash`),
	CONSTRAINT `fk_carrier_accounts_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `catalog_redirects` (
	`store_id` varchar(26) NOT NULL,
	`kind` enum('product','collection') NOT NULL,
	`from_slug` varchar(80) NOT NULL,
	`to_id` varchar(26) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `catalog_redirects_store_id_kind_from_slug_pk` PRIMARY KEY(`store_id`,`kind`,`from_slug`),
	KEY `crd_store_to_idx` (`store_id`,`to_id`),
	CONSTRAINT `fk_catalog_redirects_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collection_products` (
	`store_id` varchar(26) NOT NULL,
	`collection_id` varchar(26) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	CONSTRAINT `collection_products_store_id_collection_id_product_id_pk` PRIMARY KEY(`store_id`,`collection_id`,`product_id`),
	KEY `cp_store_product_idx` (`store_id`,`product_id`),
	KEY `cp_store_coll_pos_idx` (`store_id`,`collection_id`,`position`),
	CONSTRAINT `fk_collection_products_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `collections` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`media` longtext,
	`rules` longtext NOT NULL,
	`sort` enum('manual','newest','bestsellers','price_asc','price_desc') NOT NULL DEFAULT 'manual',
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`seo` longtext NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`product_count` int NOT NULL DEFAULT 0,
	`i18n` longtext,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `collections_id` PRIMARY KEY(`id`),
	CONSTRAINT `co_store_slug_uq` UNIQUE(`store_id`,`slug`),
	KEY `co_store_status_pos_idx` (`store_id`,`status`,`position`),
	CONSTRAINT `fk_collections_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `commission_rules` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`name` varchar(60) NOT NULL,
	`kind` enum('per_delivered','per_confirmed','percent_upsell','tier_bonus','fixed') NOT NULL,
	`amount_cents` bigint,
	`percent_bp` int,
	`params` longtext NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `commission_rules_id` PRIMARY KEY(`id`),
	KEY `cr_active_idx` (`store_id`,`active`),
	CONSTRAINT `fk_commission_rules_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `edge_reports` (
	`id` varchar(26) NOT NULL,
	`minute` datetime(3) NOT NULL,
	`worker_version` varchar(64) NOT NULL,
	`requests` int unsigned NOT NULL DEFAULT 0,
	`cache_hit` int unsigned NOT NULL DEFAULT 0,
	`cache_miss` int unsigned NOT NULL DEFAULT 0,
	`cache_bypass` int unsigned NOT NULL DEFAULT 0,
	`origin_5xx` int unsigned NOT NULL DEFAULT 0,
	`origin_down` int unsigned NOT NULL DEFAULT 0,
	`internal_error` int unsigned NOT NULL DEFAULT 0,
	`purge_ok` int unsigned NOT NULL DEFAULT 0,
	`purge_fail` int unsigned NOT NULL DEFAULT 0,
	`cache_mode` enum('on','off') NOT NULL DEFAULT 'off',
	`last_purge_error` varchar(64),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `edge_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `er_minute_ver_uq` UNIQUE(`minute`,`worker_version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `expenses` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`day` date NOT NULL,
	`category` varchar(40) NOT NULL,
	`amount_cents` bigint NOT NULL,
	`note` varchar(200),
	`recurring_rule` longtext,
	`parent_id` varchar(26),
	`occurrence` date,
	`attachment_ref` varchar(200),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `ex_occ_uq` UNIQUE(`store_id`,`parent_id`,`occurrence`),
	KEY `ex_day_idx` (`store_id`,`day`),
	CONSTRAINT `fk_expenses_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `finance_daily` (
	`store_id` varchar(26) NOT NULL,
	`day` date NOT NULL,
	`dim_key` varchar(160) NOT NULL,
	`placed` int NOT NULL DEFAULT 0,
	`confirmed` int NOT NULL DEFAULT 0,
	`cancelled` int NOT NULL DEFAULT 0,
	`fake` int NOT NULL DEFAULT 0,
	`shipped` int NOT NULL DEFAULT 0,
	`delivered` int NOT NULL DEFAULT 0,
	`refused` int NOT NULL DEFAULT 0,
	`returned` int NOT NULL DEFAULT 0,
	`lost` int NOT NULL DEFAULT 0,
	`placed_cents` bigint NOT NULL DEFAULT 0,
	`delivered_cents` bigint NOT NULL DEFAULT 0,
	`refund_cents` bigint NOT NULL DEFAULT 0,
	`cogs_cents` bigint NOT NULL DEFAULT 0,
	`packaging_cents` bigint NOT NULL DEFAULT 0,
	`shipping_cost_cents` bigint NOT NULL DEFAULT 0,
	`return_cost_cents` bigint NOT NULL DEFAULT 0,
	`cod_fee_cents` bigint NOT NULL DEFAULT 0,
	`commission_cents` bigint NOT NULL DEFAULT 0,
	`ad_spend_cents` bigint NOT NULL DEFAULT 0,
	`expense_cents` bigint NOT NULL DEFAULT 0,
	`net_cents` bigint NOT NULL DEFAULT 0,
	`expected_net_cents` bigint NOT NULL DEFAULT 0,
	`missing_costs` int NOT NULL DEFAULT 0,
	`missing_rates` int NOT NULL DEFAULT 0,
	`computed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `finance_daily_store_id_day_dim_key_pk` PRIMARY KEY(`store_id`,`day`,`dim_key`),
	CONSTRAINT `fk_finance_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `import_mappings` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`kind` enum('remittance','tracking','status','ad_spend','products','reviews','manifest','expenses') NOT NULL,
	`name` varchar(60) NOT NULL,
	`columns` longtext NOT NULL,
	`carrier_account_id` varchar(26),
	`created_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `import_mappings_id` PRIMARY KEY(`id`),
	CONSTRAINT `im_name_uq` UNIQUE(`store_id`,`kind`,`name`),
	CONSTRAINT `fk_import_mappings_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `import_runs` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`kind` enum('remittance','tracking','status','ad_spend','products','reviews','manifest','expenses') NOT NULL,
	`mapping_id` varchar(26),
	`carrier_account_id` varchar(26) NOT NULL DEFAULT '',
	`file_ref` varchar(200) NOT NULL,
	`file_sha256` char(64) NOT NULL,
	`rows` int NOT NULL DEFAULT 0,
	`ok` int NOT NULL DEFAULT 0,
	`failed` int NOT NULL DEFAULT 0,
	`skipped` int NOT NULL DEFAULT 0,
	`state` enum('previewed','committing','committed','failed') NOT NULL DEFAULT 'previewed',
	`report` longtext,
	`context` longtext,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`committed_at` datetime(3),
	CONSTRAINT `import_runs_id` PRIMARY KEY(`id`),
	KEY `ir_kind_idx` (`store_id`,`kind`,`created_at`),
	KEY `ir_sha_idx` (`store_id`,`kind`,`file_sha256`),
	CONSTRAINT `fk_import_runs_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `inventory_levels` (
	`store_id` varchar(26) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`stock_key` varchar(64) NOT NULL,
	`on_hand` int,
	`held` int NOT NULL DEFAULT 0,
	`low_at` int,
	`updated_by` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `inventory_levels_store_id_product_id_stock_key_pk` PRIMARY KEY(`store_id`,`product_id`,`stock_key`),
	CONSTRAINT `fk_inventory_levels_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `inventory_moves` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`product_id` varchar(26) NOT NULL,
	`stock_key` varchar(64) NOT NULL,
	`delta` int NOT NULL,
	`reason` enum('manual','shipped','returned_restock','import','hold','release','correction') NOT NULL,
	`order_id` varchar(20),
	`note` varchar(200),
	`at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`by` varchar(26),
	CONSTRAINT `inventory_moves_id` PRIMARY KEY(`id`),
	CONSTRAINT `im_order_uq` UNIQUE(`store_id`,`order_id`,`product_id`,`stock_key`,`reason`),
	KEY `im_store_product_idx` (`store_id`,`product_id`,`at`),
	CONSTRAINT `fk_inventory_moves_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notification_prefs` (
	`user_id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL DEFAULT '',
	`group` varchar(16) NOT NULL,
	`channels` longtext NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `notification_prefs_user_id_store_id_group_pk` PRIMARY KEY(`user_id`,`store_id`,`group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payouts` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`user_id` varchar(26) NOT NULL,
	`period_from` date NOT NULL,
	`period_to` date NOT NULL,
	`total_cents` bigint NOT NULL DEFAULT 0,
	`entries` int NOT NULL DEFAULT 0,
	`state` enum('draft','approved','paid','cancelled') NOT NULL DEFAULT 'draft',
	`approved_by` varchar(26),
	`approved_at` datetime(3),
	`paid_at` datetime(3),
	`method` enum('cash','transfer','other'),
	`ref` varchar(80),
	`note` varchar(200),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`),
	KEY `po_user_idx` (`store_id`,`user_id`,`period_from`),
	CONSTRAINT `fk_payouts_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `products` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`slug` varchar(80) NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`name` varchar(160) NOT NULL,
	`public_key` varchar(40) NOT NULL,
	`rev` char(26) NOT NULL,
	`doc` longtext NOT NULL,
	`content` longtext NOT NULL,
	`seo` longtext NOT NULL,
	`stock` longtext NOT NULL,
	`primary_collection_id` varchar(26),
	`tags` longtext,
	`search_text` varchar(1000) NOT NULL DEFAULT '',
	`price_min_cents` bigint NOT NULL DEFAULT 0,
	`price_max_cents` bigint NOT NULL DEFAULT 0,
	`available` boolean NOT NULL DEFAULT true,
	`sold_30d` int NOT NULL DEFAULT 0,
	`position` int NOT NULL DEFAULT 0,
	`catalog_version` int NOT NULL DEFAULT 0,
	`published_at` datetime(3),
	`i18n` longtext,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `pr_store_slug_uq` UNIQUE(`store_id`,`slug`),
	CONSTRAINT `pr_key_uq` UNIQUE(`public_key`),
	KEY `pr_store_status_pos_idx` (`store_id`,`status`,`position`),
	KEY `pr_store_status_sold_idx` (`store_id`,`status`,`sold_30d`),
	KEY `pr_store_status_price_idx` (`store_id`,`status`,`price_min_cents`),
	KEY `pr_store_updated_idx` (`store_id`,`updated_at`),
	CONSTRAINT `fk_products_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `remittance_lines` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`remittance_id` varchar(26) NOT NULL,
	`row_no` int NOT NULL,
	`tracking` varchar(64),
	`order_id` varchar(20),
	`shipment_id` varchar(26),
	`phone_digits` varchar(16),
	`cod_cents` bigint NOT NULL,
	`fee_cents` bigint,
	`return_fee_cents` bigint,
	`net_cents` bigint,
	`match` enum('matched','amount_diff','fee_diff','unknown','duplicate','probable') NOT NULL,
	`diff_cents` bigint,
	`note` varchar(200),
	CONSTRAINT `remittance_lines_id` PRIMARY KEY(`id`),
	KEY `rl_rem_idx` (`store_id`,`remittance_id`),
	KEY `rl_track_idx` (`store_id`,`tracking`),
	KEY `rl_order_idx` (`store_id`,`order_id`),
	CONSTRAINT `fk_remittance_lines_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `remittances` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`carrier_account_id` varchar(26) NOT NULL,
	`statement_ref` varchar(80) NOT NULL,
	`period_from` date,
	`period_to` date,
	`paid_at` datetime(3),
	`gross_cents` bigint NOT NULL DEFAULT 0,
	`fees_cents` bigint NOT NULL DEFAULT 0,
	`net_cents` bigint NOT NULL DEFAULT 0,
	`lines` int NOT NULL DEFAULT 0,
	`matched` int NOT NULL DEFAULT 0,
	`state` enum('imported','matched','disputed','closed') NOT NULL DEFAULT 'imported',
	`import_run_id` varchar(26) NOT NULL,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `remittances_id` PRIMARY KEY(`id`),
	CONSTRAINT `rm_ref_uq` UNIQUE(`store_id`,`carrier_account_id`,`statement_ref`),
	CONSTRAINT `fk_remittances_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shipment_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`shipment_id` varchar(26) NOT NULL,
	`at` datetime(3) NOT NULL,
	`carrier_status` varchar(80) NOT NULL,
	`mapped_state` varchar(24),
	`source` enum('csv','webhook','poll','manual') NOT NULL,
	`raw` longtext,
	CONSTRAINT `shipment_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `se_dedupe_uq` UNIQUE(`store_id`,`shipment_id`,`at`,`carrier_status`),
	CONSTRAINT `fk_shipment_events_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shipments` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`order_id` varchar(20) NOT NULL,
	`carrier_account_id` varchar(26) NOT NULL,
	`tracking` varchar(64),
	`state` enum('none','to_pack','packed','shipped','in_transit','out_for_delivery','delivered','refused','returned','lost','attempt_failed','postponed') NOT NULL DEFAULT 'to_pack',
	`kind` enum('full','partial','reship') NOT NULL DEFAULT 'full',
	`fee_cents` bigint,
	`cod_cents` bigint NOT NULL,
	`return_fee_cents` bigint,
	`label_ref` varchar(120),
	`parent_id` varchar(26),
	`batch_id` varchar(26),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`shipped_at` datetime(3),
	`delivered_at` datetime(3),
	`returned_at` datetime(3),
	`remittance_id` varchar(26),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `shipments_id` PRIMARY KEY(`id`),
	CONSTRAINT `sh_track_uq` UNIQUE(`store_id`,`carrier_account_id`,`tracking`),
	KEY `sh_order_idx` (`store_id`,`order_id`),
	KEY `sh_state_idx` (`store_id`,`state`,`created_at`),
	KEY `sh_unremitted_idx` (`store_id`,`remittance_id`,`delivered_at`),
	KEY `sh_batch_idx` (`store_id`,`batch_id`),
	CONSTRAINT `fk_shipments_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stats_version_daily` (
	`store_id` varchar(26) NOT NULL,
	`page_id` varchar(26) NOT NULL,
	`version_id` varchar(26) NOT NULL,
	`variant_key` varchar(40) NOT NULL DEFAULT '',
	`utm_source` varchar(40) NOT NULL DEFAULT '',
	`day` date NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`uniques` int NOT NULL DEFAULT 0,
	`form_starts` int NOT NULL DEFAULT 0,
	`orders` int NOT NULL DEFAULT 0,
	`confirmed` int NOT NULL DEFAULT 0,
	`delivered` int NOT NULL DEFAULT 0,
	`returned` int NOT NULL DEFAULT 0,
	`fake` int NOT NULL DEFAULT 0,
	`refused` int NOT NULL DEFAULT 0,
	`cancelled` int NOT NULL DEFAULT 0,
	`delivered_evidence` int NOT NULL DEFAULT 0,
	CONSTRAINT `stats_version_daily_pk` PRIMARY KEY(`store_id`,`page_id`,`version_id`,`variant_key`,`utm_source`,`day`),
	CONSTRAINT `fk_stats_version_daily_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `store_themes` (
	`store_id` varchar(26) NOT NULL,
	`version` int NOT NULL,
	`status` enum('draft','active','archived') NOT NULL DEFAULT 'draft',
	`active_key` varchar(26),
	`genome` longtext NOT NULL,
	`theme_spec` longtext NOT NULL,
	`locks` longtext NOT NULL,
	`logo` longtext,
	`note` varchar(200),
	`active` boolean NOT NULL DEFAULT false,
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `store_themes_store_id_version_pk` PRIMARY KEY(`store_id`,`version`),
	CONSTRAINT `st_active_uq` UNIQUE(`active_key`),
	KEY `st_store_status_idx` (`store_id`,`status`,`version`),
	CONSTRAINT `fk_store_themes_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `webhook_endpoints` (
	`id` varchar(26) NOT NULL,
	`store_id` varchar(26) NOT NULL,
	`name` varchar(60) NOT NULL DEFAULT '',
	`url` varchar(500) NOT NULL,
	`events` longtext NOT NULL,
	`secret_enc` text NOT NULL,
	`secret_prev_enc` text,
	`secret_prev_until` datetime(3),
	`include_phone` boolean NOT NULL DEFAULT false,
	`status` enum('active','paused','disabled') NOT NULL DEFAULT 'active',
	`failing_since` datetime(3),
	`created_by` varchar(26),
	`created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	CONSTRAINT `webhook_endpoints_id` PRIMARY KEY(`id`),
	KEY `we_store_idx` (`store_id`),
	CONSTRAINT `fk_webhook_endpoints_store` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;--> statement-breakpoint
-- 2. pages (§D.2 0006; STO-§3.1, §17.1; R-D41): theme_mode is read on landing rows only; attach_opts on attached landings.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `theme_mode` enum(''store'',''campaign'')', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'theme_mode');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `pages` ADD `attach_opts` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'pages' AND column_name = 'attach_opts');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 3. page_versions (§D.2 0006; STO-R6, LAN Q24): the product revision an attached landing was rendered against, and the
-- `sync` kind appended (MODIFY only while the column still has exactly the R1 type).
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `page_versions` ADD `product_rev` char(26)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'product_rev');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `page_versions` MODIFY `kind` enum(''generation'',''save'',''publish'',''restore'',''import'',''autosave'',''sync'') NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'page_versions' AND column_name = 'kind' AND column_type = 'enum(''generation'',''save'',''publish'',''restore'',''import'',''autosave'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 4. orders (§D.2 0006; OPE-§2.1, §16.3; STO-§16.4; AI-12): the six new columns as ONE ALTER when none exists (one
-- metadata change on the live table), then the per-column fallback when an earlier run left only some.
SET @present := (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name IN ('catalog_version', 'cost_snapshot', 'variant_key', 'collected_cents', 'refund_cents', 'refunded_at'));--> statement-breakpoint
SET @ddl := IF(@present = 0, 'ALTER TABLE `orders` ADD `catalog_version` int, ADD `cost_snapshot` longtext, ADD `variant_key` varchar(40), ADD `collected_cents` bigint, ADD `refund_cents` bigint, ADD `refunded_at` datetime(3)', 'DO 0');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `catalog_version` int', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'catalog_version');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `cost_snapshot` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'cost_snapshot');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `variant_key` varchar(40)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'variant_key');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `collected_cents` bigint', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'collected_cents');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `refund_cents` bigint', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'refund_cents');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `orders` ADD `refunded_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'refunded_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- orders.money_state: `refunded` appended (OD59, OPE Q.27b).
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `orders` MODIFY `money_state` enum(''unpaid'',''collected'',''remitted'',''disputed'',''written_off'',''refunded'') NOT NULL DEFAULT ''unpaid''', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'money_state' AND column_type = 'enum(''unpaid'',''collected'',''remitted'',''disputed'',''written_off'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- orders.page_id → NULL-able (ORD-19, the guarded type change of 0006): a store (v3) order has no landing page.
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `orders` MODIFY `page_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'page_id' AND is_nullable = 'NO');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 5. leads.page_id → NULL-able (STO-R9): an abandoned-checkout lead of store mode has no landing page.
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `leads` MODIFY `page_id` varchar(26) NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'leads' AND column_name = 'page_id' AND is_nullable = 'NO');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 6. order_events.actor_kind: `integration` (a carrier adapter only) and `reconciliation` appended (AI R37, R45).
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `order_events` MODIFY `actor_kind` enum(''user'',''system'',''customer'',''sheet'',''carrier'',''api'',''platform'',''bot'',''integration'',''reconciliation'') NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'order_events' AND column_name = 'actor_kind' AND column_type = 'enum(''user'',''system'',''customer'',''sheet'',''carrier'',''api'',''platform'',''bot'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 7. agent_profiles (S4, OP-19): the reveal-rate alarm and its pause survive a restart.
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `agent_profiles` ADD `reveal_alarm_at` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agent_profiles' AND column_name = 'reveal_alarm_at');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `agent_profiles` ADD `reveal_paused_until` datetime(3)', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'agent_profiles' AND column_name = 'reveal_paused_until');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 8. ai_jobs: `catalog_from_photos` appended (STO-§4.7, S1 / S7); the stage input and the reservation in the row (CCR r1-p7-9).
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `ai_jobs` MODIFY `kind` enum(''director_deep'',''store_blueprint'',''logo_system'',''health_report'',''probe'',''catalog_from_photos'') NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_jobs' AND column_name = 'kind' AND column_type = 'enum(''director_deep'',''store_blueprint'',''logo_system'',''health_report'',''probe'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `ai_jobs` ADD `input` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_jobs' AND column_name = 'input');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
SET @ddl := (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `ai_jobs` ADD `reservation` longtext', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ai_jobs' AND column_name = 'reservation');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;--> statement-breakpoint
-- 9. outbox.kind: `edge_purge` appended (OS-12, S6: Worker edge-cache purges ride the outbox).
SET @ddl := (SELECT IF(COUNT(*) = 1, 'ALTER TABLE `outbox` MODIFY `kind` enum(''webhook'',''capi'',''telegram'',''whatsapp'',''mail'',''carrier'',''edge_purge'') NOT NULL', 'DO 0') FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'outbox' AND column_name = 'kind' AND column_type = 'enum(''webhook'',''capi'',''telegram'',''whatsapp'',''mail'',''carrier'')');--> statement-breakpoint
PREPARE s FROM @ddl;--> statement-breakpoint
EXECUTE s;--> statement-breakpoint
DEALLOCATE PREPARE s;
