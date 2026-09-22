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

export type RewardRedemptionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type TaskCompletionSubmissionStatus =
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
          due_at_has_time:           boolean | null;
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
          due_at_has_time?:           boolean | null;
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
      // reward_redemptions
      // Request/approval workflow (Decision 1). No INSERT/UPDATE/DELETE
      // grant to anon or authenticated at all (see
      // supabase/migrations/20260822000000_reward_redemptions.sql) — every
      // mutation goes through the three SECURITY DEFINER RPCs below.
      // Insert/Update are `never`, mirroring points_balances/
      // point_transactions' own "no direct client mutation" convention.
      // ----------------------------------------------------------
      reward_redemptions: {
        Row: {
          id:                        string;
          household_id:              string;
          reward_id:                 string;
          requested_by_profile_id:   string;
          client_request_id:         string;
          points_required_snapshot:  number;
          status:                    RewardRedemptionStatus;
          reviewed_by_profile_id:    string | null;
          reviewed_at:               string | null;
          // Reward Reserved Points — legacy compatibility discriminator.
          // 'legacy' = predates reservation accounting (never reserved,
          // never should be). 'reserved' = created by the reservation-
          // aware request_reward_redemption RPC. See
          // supabase/migrations/20260830010000_reward_redemption_reserved_points.sql.
          reservation_model:         'legacy' | 'reserved';
          requested_at:              string;
          created_at:                string;
          updated_at:                string;
        };
        Insert: never;
        Update: never;
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
          household_id:          string;
          code:                  string;
          role:                  Extract<HouseholdMemberRole, 'admin' | 'adult' | 'child'>;
          created_by_profile_id: string;
        };
        Update: never;
        Relationships: [];
      };
      // ----------------------------------------------------------
      // task_completion_submissions
      // Task Completion Photo Proof — Slice 1 (schema only). One row per
      // completion attempt; tasks.status remains the workflow authority.
      // No RPC/mutation path exists yet — added in a later migration.
      // ----------------------------------------------------------
      task_completion_submissions: {
        Row: {
          id:                      string;
          task_id:                 string;
          household_id:            string;
          submitted_by_profile_id: string;
          client_request_id:       string;
          photo_storage_path:      string | null;
          status:                  TaskCompletionSubmissionStatus;
          reviewed_by_profile_id:  string | null;
          reviewed_at:             string | null;
          submitted_at:            string;
          created_at:              string;
          updated_at:              string;
        };
        Insert: never;
        Update: never;
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
      revoke_household_invite: {
        Args: {
          p_invite_id: string;
        };
        Returns: Database['public']['Tables']['household_invites']['Row'];
      };
      claim_open_task: {
        Args: {
          p_task_id: string;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      complete_task: {
        Args: {
          p_task_id: string;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      request_task_completion: {
        Args: {
          p_task_id: string;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      approve_task_completion: {
        Args: {
          p_task_id: string;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      reject_task_completion: {
        Args: {
          p_task_id: string;
        };
        Returns: Database['public']['Tables']['tasks']['Row'];
      };
      // Task Completion Photo Proof — Slice 2B
      // (20260910000000_task_completion_v2_and_task_governance.sql). Args/
      // Returns copied exactly from the migration's own RETURNS/parameter
      // list, not shaped to fit any repository-layer type — verified
      // against the migration source directly.
      request_task_completion_v2: {
        Args: {
          p_task_id:           string;
          p_client_request_id: string;
          p_photo_object_id?:  string | null;
        };
        Returns: Database['public']['Tables']['task_completion_submissions']['Row'];
      };
      approve_task_completion_v2: {
        Args: {
          p_submission_id: string;
        };
        Returns: Database['public']['Tables']['task_completion_submissions']['Row'];
      };
      reject_task_completion_v2: {
        Args: {
          p_submission_id: string;
        };
        Returns: Database['public']['Tables']['task_completion_submissions']['Row'];
      };
      request_reward_redemption: {
        Args: {
          p_reward_id:         string;
          p_client_request_id: string;
        };
        Returns: Database['public']['Tables']['reward_redemptions']['Row'];
      };
      approve_reward_redemption: {
        Args: {
          p_redemption_id: string;
        };
        Returns: Database['public']['Tables']['reward_redemptions']['Row'];
      };
      reject_reward_redemption: {
        Args: {
          p_redemption_id: string;
        };
        Returns: Database['public']['Tables']['reward_redemptions']['Row'];
      };
      cancel_reward_redemption: {
        Args: {
          p_redemption_id: string;
        };
        Returns: Database['public']['Tables']['reward_redemptions']['Row'];
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
      reward_redemption_status:  RewardRedemptionStatus;
      task_completion_submission_status: TaskCompletionSubmissionStatus;
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
export type RewardRedemptionRow  = Database['public']['Tables']['reward_redemptions']['Row'];
export type TaskCompletionSubmissionRow = Database['public']['Tables']['task_completion_submissions']['Row'];
