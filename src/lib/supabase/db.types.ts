// Hand-written database types for the Supabase Postgres schema.
// Mirrors supabase/migrations/0001_init.sql + 0004_business_managers.sql.
// Keep these in sync if you change the migrations.
// Metric columns mirror DailyMetric in src/lib/types.ts.

export type UserRole = "admin" | "staff" | "client" | "super_admin";
export type AccountSource = "agency" | "client_oauth";

export interface BusinessManagerRow {
  id: string; // uuid
  name: string;
  slug: string;
  created_at: string; // timestamptz
  // Per-BM Meta access token (encrypted at the app layer with AES-256-GCM —
  // base64 of iv||ciphertext||authTag). Added in migration 0006.
  meta_access_token_encrypted: string | null;
  meta_token_updated_at: string | null; // timestamptz
}

export interface ProfileRow {
  id: string; // uuid, references auth.users
  role: UserRole;
  client_id: string | null; // uuid, references clients
  full_name: string | null;
  created_at: string; // timestamptz
  business_manager_id: string | null; // uuid, references business_managers; null = super_admin sees all
}

export interface ClientRow {
  id: string; // uuid
  name: string;
  slug: string;
  logo_url: string | null;
  created_at: string;
  business_manager_id: string | null; // uuid, references business_managers
}

export interface AdAccountRow {
  id: string; // uuid
  client_id: string; // uuid
  meta_account_id: string; // e.g. 'act_123'
  name: string;
  source: AccountSource;
  currency: string; // e.g. 'GBP'
  status: string; // 'active' | 'paused' | ...
  created_at: string;
}

export interface MetricsDailyRow {
  id: string; // uuid
  ad_account_id: string; // uuid
  date: string; // date (yyyy-mm-dd)
  spend: number;
  clicks: number;
  impressions: number; // bigint, fits in JS number for realistic volumes
  reach: number; // bigint
  leads: number;
  schedules: number;
  revenue: number;
  updated_at: string; // timestamptz
}

export interface CampaignMetricsDailyRow {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string;
  status: string;
  date: string;
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  leads: number;
  schedules: number;
  revenue: number;
  updated_at: string;
}

export interface MetaConnectionRow {
  id: string;
  client_id: string;
  ad_account_id: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  created_at: string;
}

export interface TrackedConversionRow {
  id: string; // uuid
  ad_account_id: string; // uuid
  action_type: string;
  display_name: string;
  is_enabled: boolean;
  display_order: number;
  custom_conversion_id: string | null;
  meta_name: string | null;
  first_seen_at: string; // timestamptz
  updated_at: string; // timestamptz
}

export interface ConversionMetricsDailyRow {
  id: string; // uuid
  ad_account_id: string; // uuid
  action_type: string;
  date: string; // date
  count: number;
  value: number;
  updated_at: string; // timestamptz
}

export interface ConversionMetricsCampaignDailyRow {
  id: string; // uuid
  ad_account_id: string; // uuid
  campaign_id: string;
  action_type: string;
  date: string; // date
  count: number;
  value: number;
  updated_at: string; // timestamptz
}

export interface SyncLogRow {
  id: string;
  ad_account_id: string;
  started_at: string;
  finished_at: string | null;
  status: string; // 'running' | 'success' | 'error'
  rows_written: number;
  error: string | null;
}

// A minimal Database type compatible with @supabase/ssr / supabase-js generics.
// We provide Row types (read shape) plus permissive Insert/Update so the typed
// client compiles without a full generated schema.
type TableShape<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: TableShape<ProfileRow>;
      clients: TableShape<ClientRow>;
      ad_accounts: TableShape<AdAccountRow>;
      metrics_daily: TableShape<MetricsDailyRow>;
      campaign_metrics_daily: TableShape<CampaignMetricsDailyRow>;
      meta_connections: TableShape<MetaConnectionRow>;
      sync_log: TableShape<SyncLogRow>;
      business_managers: TableShape<BusinessManagerRow>;
      tracked_conversions: TableShape<TrackedConversionRow>;
      conversion_metrics_daily: TableShape<ConversionMetricsDailyRow>;
      conversion_metrics_campaign_daily: TableShape<ConversionMetricsCampaignDailyRow>;
    };
    Views: Record<never, never>;
    Functions: {
      is_staff: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      is_super_admin: {
        Args: Record<never, never>;
        Returns: boolean;
      };
      can_access_client: {
        Args: { p_client_id: string };
        Returns: boolean;
      };
      current_bm_id: {
        Args: Record<never, never>;
        Returns: string | null;
      };
    };
    Enums: {
      user_role: UserRole;
      account_source: AccountSource;
    };
    CompositeTypes: Record<never, never>;
  };
}
