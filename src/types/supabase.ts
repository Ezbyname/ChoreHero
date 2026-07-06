// T1.4.5: Supabase Database Types
//
// Manually authored from supabase/migrations/20260624000000_initial_schema.sql.
// When the Supabase project is linked, replace this file with output from:
//   npx supabase gen types typescript --project-id <project-ref> > src/types/supabase.ts
//
// Shape matches the Supabase JS client generated format so that switching to
// auto-generation is a drop-in replacement with no other changes required.
//
// Rule: never import from this file directly in components. Import from
// src/types/domain.ts, which re-exports narrowed app-layer types.

// ============================================================
// ENUM TYPES  (mirror Postgres enum names exactly)
// ============================================================

export type HouseholdMemberRole =
  | 'owner'
  | 'admin'
  | 'adult'
  | 'child';

export type TaskStatus =
  | 'open'
  | 'in_progress'
  | 'needs_attention'
  | 'completed';

export type RewardStatus =
  | 'active'
  | 'archived';

export type PointTransactionType =
  | 'task_completed'
  | 'manual_adjustment'
  | 'reward_redemption'
  | 'correction';

export type ServiceRequestStatus =
  | 'pending_review'
  | 'approved'
  | 'declined'
  | 'converted_to_task'
  | 'cancelled';

export type ServiceRequestType =
  | 'task'
  | 'purchase'
  | 'ride'
  | 'permission'
  | 'other';

export type TaskHelpRequestStatus =
  | 'open'
  | 'acknowledged'
  | 'resolved'
  | 'cancelled';

export type TaskHelpReason =
  | 'not_sure_what_to_do'
  | 'need_more_time'
  | 'need_adult_help'
  | 'missing_something'
  | 'cant_reach'
  | 'not_feeling_well'
  | 'other';

export type ContributionClaimStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

// ============================================================
// DATABASE TYPE
// Matches the shape expected by createClient<Database>().
// Table names are snake_case to match Postgres.
// ============================================================

export interface Database {
  public: {
    Tables: {
      // ----------------------------------------------------------
      // profiles
      // ----------------------------------------------------------
      profiles: {
        Row: {
          id:                   string;       // uuid; 1:1 with auth.users.id
          display_name:         string;
          avatar_url:           string | null;
          avatar_emoji:         string | null;
          default_household_id: string | null; // uuid; FK → households.id
          created_at:           string;
          updated_at:           string;
        };
        Insert: {
          id:                    string;       // required: must match auth.uid()
          display_name:          string;
          avatar_url?:           string | null;
          avatar_emoji?:         string | null;
          default_household_id?: string | null;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: {
          id?:                   string;
          display_name?:         string;
          avatar_url?:           string | null;
          avatar_emoji?:         string | null;
          default_household_id?: string | null;
          updated_at?:           string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // households
      // ----------------------------------------------------------
      households: {
        Row: {
          id:                    string;
          name:                  string;
          created_by_profile_id: string;
          created_at:            string;
          updated_at:            string;
        };
        Insert: {
          id?:                   string;
          name:                  string;
          created_by_profile_id: string;
          created_at?:           string;
          updated_at?:           string;
        };
        Update: {
          id?:         string;
          name?:       string;
          updated_at?: string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // household_members
      // ----------------------------------------------------------
      household_members: {
        Row: {
          id:                    string;
          household_id:          string;
          profile_id:            string;
          role:                  HouseholdMemberRole;
          display_name_override: string | null;
          joined_at:             string;
          created_at:            string;
          updated_at:            string;
        };
        Insert: {
          id?:                    string;
          household_id:           string;
          profile_id:             string;
          role:                   HouseholdMemberRole;
          display_name_override?: string | null;
          joined_at?:             string;
          created_at?:            string;
          updated_at?:            string;
        };
        Update: {
          id?:                    string;
          role?:                  HouseholdMemberRole;
          display_name_override?: string | null;
          updated_at?:            string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // tasks
      // ----------------------------------------------------------
      tasks: {
        Row: {
          id:                        string;
          household_id:              string;
          title:                     string;
          description:               string | null;
          status:                    TaskStatus;
          created_by_profile_id:     string;
          assigned_by_profile_id:    string | null;
          assignee_profile_id:       string | null;
          due_at:                    string | null;
          points:                    number;
          source_service_request_id: string | null;
          completed_at:              string | null;
          completed_by_profile_id:   string | null;
          created_at:                string;
          updated_at:                string;
        };
        Insert: {
          id?:                        string;
          household_id:               string;
          title:                      string;
          description?:               string | null;
          status?:                    TaskStatus;
          created_by_profile_id:      string;
          assigned_by_profile_id?:    string | null;
          assignee_profile_id?:       string | null;
          due_at?:                    string | null;
          points?:                    number;
          source_service_request_id?: string | null;
          completed_at?:              string | null;
          completed_by_profile_id?:   string | null;
          created_at?:                string;
          updated_at?:                string;
        };
        Update: {
          id?:                        string;
          title?:                     string;
          description?:               string | null;
          status?:                    TaskStatus;
          assigned_by_profile_id?:    string | null;
          assignee_profile_id?:       string | null;
          due_at?:                    string | null;
          points?:                    number;
          source_service_request_id?: string | null;
          completed_at?:              string | null;
          completed_by_profile_id?:   string | null;
          updated_at?:                string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // rewards
      // ----------------------------------------------------------
      rewards: {
        Row: {
          id:                    string;
          household_id:          string;
          title:                 string;
          description:           string | null;
          points_required:       number;
          status:                RewardStatus;
          created_by_profile_id: string;
          created_at:            string;
          updated_at:            string;
        };
        Insert: {
          id?:           string;
          household_id:  string;
          title:         string;
          description?:  string | null;
          points_required: number;
          status?:       RewardStatus;
          created_by_profile_id: string;
          created_at?:   string;
          updated_at?:   string;
        };
        Update: {
          id?:              string;
          title?:           string;
          description?:     string | null;
          points_required?: number;
          status?:          RewardStatus;
          updated_at?:      string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // points_balances
      // No Update: no direct client mutation in MVP.
      // All changes via SECURITY DEFINER RPCs.
      // ----------------------------------------------------------
      points_balances: {
        Row: {
          id:           string;
          household_id: string;
          profile_id:   string;
          balance:      number;
          created_at:   string;
          updated_at:   string;
        };
        Insert: {
          id?:          string;
          household_id: string;
          profile_id:   string;
          balance?:     number;
          created_at?:  string;
          updated_at?:  string;
        };
        Update: never;
        Relationships: [];
      };
      // ----------------------------------------------------------
      // point_transactions
      // No Update: immutable audit trail.
      // ----------------------------------------------------------
      point_transactions: {
        Row: {
          id:                    string;
          household_id:          string;
          profile_id:            string;
          type:                  PointTransactionType;
          amount:                number;
          balance_after:         number | null;
          task_id:               string | null;
          reward_id:             string | null;
          created_by_profile_id: string | null;
          note:                  string | null;
          created_at:            string;
        };
        Insert: {
          id?:                    string;
          household_id:           string;
          profile_id:             string;
          type:                   PointTransactionType;
          amount:                 number;
          balance_after?:         number | null;
          task_id?:               string | null;
          reward_id?:             string | null;
          created_by_profile_id?: string | null;
          note?:                  string | null;
          created_at?:            string;
        };
        Update: never;
        Relationships: [];
      };
      // ----------------------------------------------------------
      // service_requests
      // ----------------------------------------------------------
      service_requests: {
        Row: {
          id:                       string;
          household_id:             string;
          request_type:             ServiceRequestType;
          status:                   ServiceRequestStatus;
          requested_by_profile_id:  string;
          requested_for_profile_id: string | null;
          reviewed_by_profile_id:   string | null;
          title:                    string;
          description:              string | null;
          decline_reason:           string | null;
          converted_task_id:        string | null;
          reviewed_at:              string | null;
          converted_at:             string | null;
          created_at:               string;
          updated_at:               string;
        };
        Insert: {
          id?:                       string;
          household_id:              string;
          request_type?:             ServiceRequestType;
          status?:                   ServiceRequestStatus;
          requested_by_profile_id:   string;
          requested_for_profile_id?: string | null;
          reviewed_by_profile_id?:   string | null;
          title:                     string;
          description?:              string | null;
          decline_reason?:           string | null;
          converted_task_id?:        string | null;
          reviewed_at?:              string | null;
          converted_at?:             string | null;
          created_at?:               string;
          updated_at?:               string;
        };
        Update: {
          id?:                       string;
          request_type?:             ServiceRequestType;
          status?:                   ServiceRequestStatus;
          requested_for_profile_id?: string | null;
          reviewed_by_profile_id?:   string | null;
          title?:                    string;
          description?:              string | null;
          decline_reason?:           string | null;
          converted_task_id?:        string | null;
          reviewed_at?:              string | null;
          converted_at?:             string | null;
          updated_at?:               string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // task_help_requests
      // ----------------------------------------------------------
      task_help_requests: {
        Row: {
          id:                         string;
          task_id:                    string;
          household_id:               string;
          requested_by_profile_id:    string;
          requested_to_profile_id:    string | null;
          status:                     TaskHelpRequestStatus;
          reason:                     TaskHelpReason;
          note:                       string | null;
          acknowledged_by_profile_id: string | null;
          resolved_by_profile_id:     string | null;
          acknowledged_at:            string | null;
          resolved_at:                string | null;
          cancelled_at:               string | null;
          created_at:                 string;
          updated_at:                 string;
        };
        Insert: {
          id?:                         string;
          task_id:                     string;
          household_id:                string;
          requested_by_profile_id:     string;
          requested_to_profile_id?:    string | null;
          status?:                     TaskHelpRequestStatus;
          reason:                      TaskHelpReason;
          note?:                       string | null;
          acknowledged_by_profile_id?: string | null;
          resolved_by_profile_id?:     string | null;
          acknowledged_at?:            string | null;
          resolved_at?:                string | null;
          cancelled_at?:               string | null;
          created_at?:                 string;
          updated_at?:                 string;
        };
        Update: {
          id?:                         string;
          requested_to_profile_id?:    string | null;
          status?:                     TaskHelpRequestStatus;
          note?:                       string | null;
          acknowledged_by_profile_id?: string | null;
          resolved_by_profile_id?:     string | null;
          acknowledged_at?:            string | null;
          resolved_at?:                string | null;
          cancelled_at?:               string | null;
          updated_at?:                 string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // contribution_claims
      // Bottom-up self-reported contributions, distinct from tasks.
      // ----------------------------------------------------------
      contribution_claims: {
        Row: {
          id:                     string;
          household_id:           string;
          title:                  string;
          description:            string | null;
          points:                 number;
          status:                 ContributionClaimStatus;
          claimed_by_profile_id:  string;
          reviewed_by_profile_id: string | null;
          reviewed_at:            string | null;
          note:                   string | null;
          created_at:             string;
          updated_at:             string;
        };
        Insert: {
          id?:                     string;
          household_id:            string;
          title:                   string;
          description?:            string | null;
          points?:                 number;
          status?:                 ContributionClaimStatus;
          claimed_by_profile_id:   string;
          reviewed_by_profile_id?: string | null;
          reviewed_at?:            string | null;
          note?:                   string | null;
          created_at?:             string;
          updated_at?:             string;
        };
        Update: {
          id?:                     string;
          status?:                 ContributionClaimStatus;
          reviewed_by_profile_id?: string | null;
          reviewed_at?:            string | null;
          note?:                   string | null;
          updated_at?:             string;
        };
        Relationships: [];
      };
      // ----------------------------------------------------------
      // household_invites
      // Shareable join codes. Redemption goes through the
      // redeem_household_invite RPC, never a direct table write.
      // ----------------------------------------------------------
      household_invites: {
        Row: {
          id:                    string;
          household_id:          string;
          code:                  string;
          role:                  HouseholdMemberRole;
          created_by_profile_id: string;
          redemption_count:      number;
          revoked_at:            string | null;
          expires_at:            string;
          created_at:            string;
        };
        Insert: {
          id?:                    string;
          household_id:           string;
          code:                   string;
          role?:                  HouseholdMemberRole;
          created_by_profile_id:  string;
          redemption_count?:      number;
          revoked_at?:            string | null;
          expires_at?:            string;
          created_at?:            string;
        };
        Update: {
          id?:         string;
          revoked_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      redeem_household_invite: {
        Args: {
          p_code:         string;
          p_display_name: string;
          p_avatar_emoji?: string | null;
        };
        Returns: string; // household_id
      };
    };
    CompositeTypes: Record<string, never>;
    Enums: {
      household_member_role:    HouseholdMemberRole;
      task_status:              TaskStatus;
      reward_status:            RewardStatus;
      point_transaction_type:   PointTransactionType;
      service_request_status:   ServiceRequestStatus;
      service_request_type:     ServiceRequestType;
      task_help_request_status: TaskHelpRequestStatus;
      task_help_reason:         TaskHelpReason;
      contribution_claim_status: ContributionClaimStatus;
    };
  };
}

// ============================================================
// DX ROW ALIASES — derived from Database
// These stay accurate automatically when this file is replaced
// by supabase gen types output.
// ============================================================

// Required by T1.4.5
export type ProfileRow         = Database['public']['Tables']['profiles']['Row'];
export type HouseholdRow       = Database['public']['Tables']['households']['Row'];
export type TaskRow            = Database['public']['Tables']['tasks']['Row'];
export type RewardRow          = Database['public']['Tables']['rewards']['Row'];

// Additional convenience aliases for repository layer
export type HouseholdMemberRow  = Database['public']['Tables']['household_members']['Row'];
export type PointsBalanceRow    = Database['public']['Tables']['points_balances']['Row'];
export type PointTransactionRow = Database['public']['Tables']['point_transactions']['Row'];
export type ServiceRequestRow   = Database['public']['Tables']['service_requests']['Row'];
export type TaskHelpRequestRow  = Database['public']['Tables']['task_help_requests']['Row'];
export type ContributionClaimRow = Database['public']['Tables']['contribution_claims']['Row'];
export type HouseholdInviteRow   = Database['public']['Tables']['household_invites']['Row'];
