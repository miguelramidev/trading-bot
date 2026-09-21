CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_date" timestamp DEFAULT now() NOT NULL,
	"balance" text NOT NULL,
	"net_pnl" text,
	"trades_taken" integer DEFAULT 0,
	"wins" integer DEFAULT 0,
	"losses" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "signal_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"timeframe" text NOT NULL,
	"evaluated_at" timestamp DEFAULT now() NOT NULL,
	"direction" text,
	"entry" text,
	"stopLoss" text,
	"takeProfit" text,
	"breakevenTarget" text,
	"minNotional" text,
	"is_active_trade" boolean DEFAULT false NOT NULL,
	"breakeven_moved" boolean DEFAULT false NOT NULL,
	"regime" text,
	"bias4h" text,
	"strategy" text,
	"atr" text,
	"volume_filter" text,
	"funding_rate" text,
	"open_interest" text,
	"btc_correlation" text,
	"volume_rank" integer,
	"btc_regime" text,
	"decision" text,
	"reason" text,
	"account_balance" text,
	"num_grids" integer,
	"grid_step" text,
	"grid_sl" text,
	"grid_tp" text
);
--> statement-breakpoint
CREATE TABLE "user_config" (
	"chat_id" text PRIMARY KEY NOT NULL,
	"is_paused" boolean DEFAULT false NOT NULL,
	"leverage" integer DEFAULT 1 NOT NULL,
	"pending_signal_id" integer,
	"starting_balance" text DEFAULT '41.78',
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_config" ADD CONSTRAINT "user_config_pending_signal_id_signal_history_id_fk" FOREIGN KEY ("pending_signal_id") REFERENCES "public"."signal_history"("id") ON DELETE no action ON UPDATE no action;