CREATE TYPE "public"."role" AS ENUM('super_admin', 'admin', 'committee', 'student');--> statement-breakpoint
CREATE TYPE "public"."scope_mode" AS ENUM('fixed', 'dynamic', 'none');--> statement-breakpoint
CREATE TYPE "public"."outbox_status" AS ENUM('pending', 'processing', 'completed', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TABLE "admin_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"designation" varchar(100),
	"department" varchar(100),
	"employee_id" varchar(50),
	"specialization" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_profiles_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "admin_profiles_employee_id_unique" UNIQUE("employee_id")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "batches_year_unique" UNIQUE("year")
);
--> statement-breakpoint
CREATE TABLE "class_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"department" varchar(100),
	"batch_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hostels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"capacity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hostels_name_unique" UNIQUE("name"),
	CONSTRAINT "hostels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"roll_no" varchar(50),
	"room_no" varchar(20),
	"hostel_id" integer,
	"class_section_id" integer,
	"batch_id" integer,
	"department" varchar(100),
	"blood_group" varchar(5),
	"parent_name" varchar(255),
	"parent_phone" varchar(20),
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "students_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "students_roll_no_unique" UNIQUE("roll_no")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_provider" varchar(64) DEFAULT 'clerk' NOT NULL,
	"external_id" varchar(100) NOT NULL,
	"email" varchar(255) NOT NULL,
	"phone" varchar(20),
	"full_name" varchar(255),
	"avatar_url" text,
	"role_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "admin_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" integer NOT NULL,
	"scope_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"icon" varchar(50),
	"color" varchar(20),
	"domain_id" integer,
	"scope_id" integer,
	"scope_mode" "scope_mode" DEFAULT 'dynamic' NOT NULL,
	"parent_category_id" integer,
	"default_admin_id" uuid,
	"sla_hours" integer DEFAULT 48,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"subcategory_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"field_type" varchar(50) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"placeholder" varchar(255),
	"options" jsonb,
	"validation" jsonb,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committee_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"committee_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"role" varchar(50),
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "committees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(140) NOT NULL,
	"description" text,
	"contact_email" varchar(256),
	"head_id" uuid,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "committees_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"scope_mode" "scope_mode" DEFAULT 'none' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name"),
	CONSTRAINT "domains_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "escalation_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_id" integer,
	"scope_id" integer,
	"level" integer NOT NULL,
	"escalate_to_user_id" uuid,
	"tat_hours" integer DEFAULT 48,
	"notify_channel" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"label" varchar(100) NOT NULL,
	"value" varchar(100) NOT NULL,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" serial PRIMARY KEY NOT NULL,
	"domain_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"reference_type" varchar(50),
	"reference_id" integer,
	"student_field_key" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"assigned_admin_id" uuid,
	"sla_hours" integer,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_activity" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" uuid,
	"action" varchar(50) NOT NULL,
	"details" jsonb,
	"visibility" varchar(20) DEFAULT 'student_visible',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"uploaded_by" uuid,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"comment" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_committee_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"committee_id" integer NOT NULL,
	"tagged_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"rating" integer NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_feedback_ticket_id_unique" UNIQUE("ticket_id")
);
--> statement-breakpoint
CREATE TABLE "ticket_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"filter_config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_by" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"value" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text,
	"color" varchar(20),
	"progress_percent" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_statuses_value_unique" UNIQUE("value")
);
--> statement-breakpoint
CREATE TABLE "ticket_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"tag" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_watchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_number" varchar(50) NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"location" varchar(500),
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"category_id" integer NOT NULL,
	"subcategory_id" integer,
	"scope_id" integer,
	"created_by" uuid NOT NULL,
	"assigned_to" uuid,
	"group_id" integer,
	"status_id" integer NOT NULL,
	"escalation_level" integer DEFAULT 0 NOT NULL,
	"escalated_at" timestamp,
	"forward_count" integer DEFAULT 0 NOT NULL,
	"reopen_count" integer DEFAULT 0 NOT NULL,
	"tat_extensions" integer DEFAULT 0 NOT NULL,
	"acknowledgement_due_at" timestamp,
	"resolution_due_at" timestamp,
	"resolved_at" timestamp,
	"closed_at" timestamp,
	"reopened_at" timestamp,
	"metadata" jsonb,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_ticket_number_unique" UNIQUE("ticket_number")
);
--> statement-breakpoint
CREATE TABLE "api_rate_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" varchar(100) NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"resource_type" varchar(50) NOT NULL,
	"resource_id" varchar(100) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"aggregate_type" varchar(50),
	"aggregate_id" varchar(100),
	"payload" jsonb NOT NULL,
	"status" "outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"last_error" text,
	"priority" integer DEFAULT 5 NOT NULL,
	"idempotency_key" varchar(255),
	"scheduled_at" timestamp DEFAULT now() NOT NULL,
	"processing_started_at" timestamp,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(100),
	CONSTRAINT "outbox_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "category_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"user_id" uuid NOT NULL,
	"assignment_type" varchar(32) DEFAULT 'primary',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_type" varchar(32) NOT NULL,
	"owner_id" varchar(255) NOT NULL,
	"channel_type" varchar(32) DEFAULT 'slack' NOT NULL,
	"slack_channel_id" varchar(255),
	"slack_thread" varchar(255),
	"slack_user_id" varchar(128),
	"priority" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope_id" integer,
	"category_id" integer,
	"subcategory_id" integer,
	"enable_slack" boolean DEFAULT true NOT NULL,
	"enable_email" boolean DEFAULT true NOT NULL,
	"slack_channel" varchar(255),
	"slack_cc_user_ids" jsonb,
	"email_recipients" jsonb,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid,
	"ticket_id" integer,
	"channel" varchar(32) NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"slack_message_id" varchar(255),
	"email_message_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ticket_integrations" (
	"ticket_id" integer PRIMARY KEY NOT NULL,
	"slack_thread_id" varchar(255),
	"slack_channel_id" varchar(255),
	"email_thread_id" varchar(255),
	"admin_link" varchar(512),
	"student_link" varchar(512),
	"external_ref" varchar(64),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_integrations_external_ref_unique" UNIQUE("external_ref")
);
--> statement-breakpoint
ALTER TABLE "admin_profiles" ADD CONSTRAINT "admin_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_sections" ADD CONSTRAINT "class_sections_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_hostel_id_hostels_id_fk" FOREIGN KEY ("hostel_id") REFERENCES "public"."hostels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_section_id_class_sections_id_fk" FOREIGN KEY ("class_section_id") REFERENCES "public"."class_sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_assignments" ADD CONSTRAINT "admin_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_assignments" ADD CONSTRAINT "admin_assignments_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_assignments" ADD CONSTRAINT "admin_assignments_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_default_admin_id_users_id_fk" FOREIGN KEY ("default_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_fields" ADD CONSTRAINT "category_fields_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committee_members" ADD CONSTRAINT "committee_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "committees" ADD CONSTRAINT "committees_head_id_users_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalation_rules" ADD CONSTRAINT "escalation_rules_escalate_to_user_id_users_id_fk" FOREIGN KEY ("escalate_to_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_options" ADD CONSTRAINT "field_options_field_id_category_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."category_fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_activity" ADD CONSTRAINT "ticket_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "ticket_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_committee_tags" ADD CONSTRAINT "ticket_committee_tags_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_committee_tags" ADD CONSTRAINT "ticket_committee_tags_committee_id_committees_id_fk" FOREIGN KEY ("committee_id") REFERENCES "public"."committees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_committee_tags" ADD CONSTRAINT "ticket_committee_tags_tagged_by_users_id_fk" FOREIGN KEY ("tagged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_feedback" ADD CONSTRAINT "ticket_feedback_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_filters" ADD CONSTRAINT "ticket_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_groups" ADD CONSTRAINT "ticket_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_tags" ADD CONSTRAINT "ticket_tags_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_watchers" ADD CONSTRAINT "ticket_watchers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_group_id_ticket_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."ticket_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_status_id_ticket_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."ticket_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_assignments" ADD CONSTRAINT "category_assignments_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_assignments" ADD CONSTRAINT "category_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_config" ADD CONSTRAINT "notification_config_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_config" ADD CONSTRAINT "notification_config_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_config" ADD CONSTRAINT "notification_config_subcategory_id_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."subcategories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_integrations" ADD CONSTRAINT "ticket_integrations_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_profiles_user_idx" ON "admin_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "class_sections_batch_idx" ON "class_sections" USING btree ("batch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "students_user_idx" ON "students" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "students_roll_no_idx" ON "students" USING btree ("roll_no");--> statement-breakpoint
CREATE INDEX "students_hostel_idx" ON "students" USING btree ("hostel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_auth_external_idx" ON "users" USING btree ("auth_provider","external_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "admin_assignments_user_idx" ON "admin_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "admin_assignments_domain_idx" ON "admin_assignments" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "admin_assignments_scope_idx" ON "admin_assignments" USING btree ("scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_assignments_user_domain_scope_idx" ON "admin_assignments" USING btree ("user_id","domain_id","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_domain_idx" ON "categories" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "categories_scope_idx" ON "categories" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX "category_fields_subcategory_idx" ON "category_fields" USING btree ("subcategory_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_fields_subcategory_slug_idx" ON "category_fields" USING btree ("subcategory_id","slug");--> statement-breakpoint
CREATE INDEX "committee_members_committee_idx" ON "committee_members" USING btree ("committee_id");--> statement-breakpoint
CREATE INDEX "committee_members_user_idx" ON "committee_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "committee_members_committee_user_idx" ON "committee_members" USING btree ("committee_id","user_id");--> statement-breakpoint
CREATE INDEX "committees_name_idx" ON "committees" USING btree ("name");--> statement-breakpoint
CREATE INDEX "committees_head_idx" ON "committees" USING btree ("head_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_domain_idx" ON "escalation_rules" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_scope_idx" ON "escalation_rules" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "escalation_rules_level_idx" ON "escalation_rules" USING btree ("level");--> statement-breakpoint
CREATE UNIQUE INDEX "escalation_rules_domain_scope_level_idx" ON "escalation_rules" USING btree ("domain_id","scope_id","level");--> statement-breakpoint
CREATE INDEX "field_options_field_idx" ON "field_options" USING btree ("field_id");--> statement-breakpoint
CREATE INDEX "scopes_domain_idx" ON "scopes" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "scopes_reference_idx" ON "scopes" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "scopes_domain_slug_idx" ON "scopes" USING btree ("domain_id","slug");--> statement-breakpoint
CREATE INDEX "subcategories_category_idx" ON "subcategories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subcategories_category_slug_idx" ON "subcategories" USING btree ("category_id","slug");--> statement-breakpoint
CREATE INDEX "ticket_activity_ticket_idx" ON "ticket_activity" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_activity_created_at_idx" ON "ticket_activity" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ticket_attachments_ticket_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_attachments_uploaded_by_idx" ON "ticket_attachments" USING btree ("uploaded_by");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_idx" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_user_idx" ON "ticket_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_committee_tags_ticket_idx" ON "ticket_committee_tags" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_committee_tags_committee_idx" ON "ticket_committee_tags" USING btree ("committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_committee_tags_ticket_committee_idx" ON "ticket_committee_tags" USING btree ("ticket_id","committee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_feedback_ticket_idx" ON "ticket_feedback" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_feedback_rating_idx" ON "ticket_feedback" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "ticket_filters_user_idx" ON "ticket_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_tags_ticket_idx" ON "ticket_tags" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_tags_tag_idx" ON "ticket_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_tags_ticket_tag_idx" ON "ticket_tags" USING btree ("ticket_id","tag");--> statement-breakpoint
CREATE INDEX "ticket_watchers_ticket_idx" ON "ticket_watchers" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_watchers_user_idx" ON "ticket_watchers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_watchers_ticket_user_idx" ON "ticket_watchers" USING btree ("ticket_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tickets_ticket_number_idx" ON "tickets" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "tickets_created_by_idx" ON "tickets" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "tickets_assigned_to_idx" ON "tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "tickets_category_idx" ON "tickets" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "tickets_group_idx" ON "tickets" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tickets_created_at_idx" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "tickets_created_by_created_at_idx" ON "tickets" USING btree ("created_by","created_at");--> statement-breakpoint
CREATE INDEX "api_rate_limits_user_endpoint_time_idx" ON "api_rate_limits" USING btree ("user_id","endpoint","timestamp");--> statement-breakpoint
CREATE INDEX "idempotency_expires_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_resource_idx" ON "idempotency_keys" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "outbox_claim_idx" ON "outbox" USING btree ("status","scheduled_at","priority");--> statement-breakpoint
CREATE INDEX "outbox_status_idx" ON "outbox" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbox_scheduled_idx" ON "outbox" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "outbox_aggregate_idx" ON "outbox" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_idempotency_idx" ON "outbox" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "category_assignments_category_idx" ON "category_assignments" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "category_assignments_user_idx" ON "category_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "category_assignments_unique_idx" ON "category_assignments" USING btree ("category_id","user_id");--> statement-breakpoint
CREATE INDEX "notification_channels_owner_idx" ON "notification_channels" USING btree ("owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "notification_channels_active_idx" ON "notification_channels" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "notification_channels_type_idx" ON "notification_channels" USING btree ("channel_type");--> statement-breakpoint
CREATE INDEX "notification_channels_priority_idx" ON "notification_channels" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "notification_config_scope_idx" ON "notification_config" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "notification_config_category_idx" ON "notification_config" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "notification_config_subcategory_idx" ON "notification_config" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "notification_config_active_idx" ON "notification_config" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "notification_config_priority_idx" ON "notification_config" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_ticket_idx" ON "notifications" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "notifications_channel_idx" ON "notifications" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "ticket_integrations_slack_idx" ON "ticket_integrations" USING btree ("slack_thread_id");--> statement-breakpoint
CREATE INDEX "ticket_integrations_email_idx" ON "ticket_integrations" USING btree ("email_thread_id");