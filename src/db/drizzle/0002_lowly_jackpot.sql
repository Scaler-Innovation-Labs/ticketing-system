DROP INDEX "category_assignments_category_idx";--> statement-breakpoint
DROP INDEX "category_assignments_user_idx";--> statement-breakpoint
DROP INDEX "category_assignments_unique_idx";--> statement-breakpoint
ALTER TABLE "category_assignments" ALTER COLUMN "assignment_type" SET DATA TYPE varchar(50);--> statement-breakpoint
ALTER TABLE "category_assignments" ALTER COLUMN "assignment_type" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "idx_cat_assign_category" ON "category_assignments" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_cat_assign_user" ON "category_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_cat_assign_unique" ON "category_assignments" USING btree ("category_id","user_id");--> statement-breakpoint
ALTER TABLE "admin_profiles" DROP COLUMN "designation";--> statement-breakpoint
ALTER TABLE "admin_profiles" DROP COLUMN "department";--> statement-breakpoint
ALTER TABLE "admin_profiles" DROP COLUMN "specialization";--> statement-breakpoint
DROP TYPE "public"."role";