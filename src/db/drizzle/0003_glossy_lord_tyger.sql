ALTER TABLE "category_fields" ADD COLUMN "assigned_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "category_fields" ADD CONSTRAINT "category_fields_assigned_admin_id_users_id_fk" FOREIGN KEY ("assigned_admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "students_class_section_idx" ON "students" USING btree ("class_section_id");--> statement-breakpoint
CREATE INDEX "students_batch_idx" ON "students" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "categories_default_admin_idx" ON "categories" USING btree ("default_admin_id");--> statement-breakpoint
CREATE INDEX "categories_is_active_idx" ON "categories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "categories_active_display_order_idx" ON "categories" USING btree ("is_active","display_order");--> statement-breakpoint
CREATE INDEX "category_fields_assigned_admin_idx" ON "category_fields" USING btree ("assigned_admin_id");--> statement-breakpoint
CREATE INDEX "category_fields_subcategory_admin_idx" ON "category_fields" USING btree ("subcategory_id","assigned_admin_id");--> statement-breakpoint
CREATE INDEX "subcategories_assigned_admin_idx" ON "subcategories" USING btree ("assigned_admin_id");--> statement-breakpoint
CREATE INDEX "subcategories_is_active_idx" ON "subcategories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subcategories_category_active_display_idx" ON "subcategories" USING btree ("category_id","is_active","display_order");--> statement-breakpoint
CREATE INDEX "ticket_activity_ticket_created_at_idx" ON "ticket_activity" USING btree ("ticket_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_subcategory_idx" ON "tickets" USING btree ("subcategory_id");--> statement-breakpoint
CREATE INDEX "tickets_scope_idx" ON "tickets" USING btree ("scope_id");--> statement-breakpoint
CREATE INDEX "tickets_category_subcategory_idx" ON "tickets" USING btree ("category_id","subcategory_id");--> statement-breakpoint
CREATE INDEX "tickets_status_category_idx" ON "tickets" USING btree ("status_id","category_id");--> statement-breakpoint
CREATE INDEX "tickets_student_dashboard_idx" ON "tickets" USING btree ("created_by","status_id","updated_at");