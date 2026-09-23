/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'user_config'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "user_config" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "user_config" ALTER COLUMN "chat_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "realized_pnl" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "realized_roi" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "executed_entry_price" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "executed_exit_price" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_volume" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_avg_volume" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_rsi" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_ema21" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_adx" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_lower_bb" text;--> statement-breakpoint
ALTER TABLE "signal_history" ADD COLUMN "trigger_upper_bb" text;--> statement-breakpoint
ALTER TABLE "user_config" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "user_config" ADD COLUMN "firebase_uid" text;--> statement-breakpoint
ALTER TABLE "user_config" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "user_config" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "user_config" ADD CONSTRAINT "user_config_chat_id_unique" UNIQUE("chat_id");--> statement-breakpoint
ALTER TABLE "user_config" ADD CONSTRAINT "user_config_firebase_uid_unique" UNIQUE("firebase_uid");--> statement-breakpoint
ALTER TABLE "user_config" ADD CONSTRAINT "user_config_email_unique" UNIQUE("email");