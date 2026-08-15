CREATE TABLE `automation_agents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`agentName` varchar(128) NOT NULL,
	`status` enum('active','paused','error') NOT NULL DEFAULT 'active',
	`targetService` varchar(64) NOT NULL,
	`lastRunAt` timestamp NOT NULL DEFAULT (now()),
	`metricsJson` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automation_agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proxy_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`event_type` varchar(128) NOT NULL DEFAULT 'unknown',
	`endpoint` varchar(255) NOT NULL,
	`method` varchar(16) NOT NULL,
	`status` int NOT NULL,
	`latency_ms` float NOT NULL,
	`payload` text,
	`delivery_state` enum('received','delivered','failed','replayed') NOT NULL DEFAULT 'received',
	`attempt_count` int NOT NULL DEFAULT 1,
	`replayed_from_event_id` int,
	`last_error` text,
	`healed` int NOT NULL DEFAULT 0,
	`healing_details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `proxy_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `schema_healing_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`event_type` varchar(128) NOT NULL,
	`field_path` varchar(255) NOT NULL,
	`original_error` text NOT NULL,
	`patch_applied` text NOT NULL,
	`confidence` float NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `schema_healing_logs_id` PRIMARY KEY(`id`)
);
