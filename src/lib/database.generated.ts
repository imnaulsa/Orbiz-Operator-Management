// Generated from migrated PostgreSQL catalog by scripts/test-db.mjs. Do not hand-edit.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
export type Database = { public: { Tables: {
audit_logs: { Row: { id: string; location_id: string | null; actor_id: string; action: string; entity_id: string | null; details: Json; created_at: string }; Insert: never; Update: never; Relationships: [] };
availability_slots: { Row: { id: string; submission_id: string; operator_id: string; location_id: string; work_date: string; hour: number; status: Database['public']['Enums']['review_status'] }; Insert: never; Update: never; Relationships: [] };
availability_submissions: { Row: { id: string; operator_id: string; location_id: string; status: Database['public']['Enums']['review_status']; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }; Insert: never; Update: never; Relationships: [] };
host_availability: { Row: { id: string; host_id: string; location_id: string; work_date: string; hour: number; status: Database['public']['Enums']['review_status']; reviewed_by: string | null; review_note: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
host_leaves: { Row: { id: string; host_id: string; location_id: string; work_date: string; start_hour: number; end_hour: number; reason: string; status: Database['public']['Enums']['review_status']; reviewed_by: string | null; review_note: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
host_rates: { Row: { id: string; host_id: string; location_id: string; effective_date: string; hourly_fee: number; created_by: string }; Insert: never; Update: never; Relationships: [] };
leave_requests: { Row: { id: string; operator_id: string; location_id: string; starts_at: string; ends_at: string; leave_type: string; reason: string; status: Database['public']['Enums']['review_status']; submitted_at: string; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }; Insert: never; Update: never; Relationships: [] };
live_checks: { Row: { id: string; session_id: string; location_id: string; kind: string; submitted_by: string; answers: Json; note: string; actual_start: string | null; actual_end: string | null; created_at: string }; Insert: never; Update: never; Relationships: [] };
live_sessions: { Row: { id: string; location_id: string; quotation_id: string; studio_id: string; lane: number; work_date: string; start_hour: number; end_hour: number; host_id: string | null; host_fee: number | null; status: string; created_by: string; created_at: string }; Insert: never; Update: never; Relationships: [] };
locations: { Row: { id: string; name: string }; Insert: never; Update: never; Relationships: [] };
operator_rates: { Row: { id: string; operator_id: string; location_id: string; effective_date: string; hourly_fee: number; created_by: string; created_at: string }; Insert: never; Update: never; Relationships: [] };
production_quotations: { Row: { id: string; location_id: string | null; reference: string; brand: string; account: string; platform: string; period_start: string; period_end: string; hours: number; rate: number; best_hours: (number)[]; created_by: string; created_at: string }; Insert: never; Update: never; Relationships: [] };
production_studios: { Row: { id: string; location_id: string; name: string; capacity: number }; Insert: never; Update: never; Relationships: [] };
profiles: { Row: { id: string; display_name: string; role: Database['public']['Enums']['app_role']; location_id: string | null; employment_type: Database['public']['Enums']['employment_type']; active: boolean; created_at: string }; Insert: never; Update: never; Relationships: [] };
schedule_assignments: { Row: { id: string; operator_id: string; location_id: string; work_date: string; hour: number; layer: Database['public']['Enums']['assignment_layer']; publication_id: string | null; rate_id: string | null; hourly_fee: number | null; created_by: string; created_at: string; cancelled_at: string | null; cancelled_by: string | null; cancellation_reason: string | null }; Insert: never; Update: never; Relationships: [] };
schedule_publications: { Row: { id: string; location_id: string; week_start: string; version: number; published_by: string; published_at: string }; Insert: never; Update: never; Relationships: [] };
schedule_signals: { Row: { location_id: string; revision: number }; Insert: never; Update: never; Relationships: [] };
}; Views: {}; Functions: {
calculate_operator_cost: { Args: { p_location: string | null; p_start: string; p_end: string }; Returns: Json };
publish_schedule_week: { Args: { p_location: string | null; p_week: string }; Returns: string };
submit_partial_availability: { Args: { p_slots: Json }; Returns: string };
review_availability_submission: { Args: { p_id: string; p_approve: boolean; p_note?: string }; Returns: undefined };
submit_leave_request: { Args: { p_date: string; p_start: string; p_end: string; p_type: string; p_reason: string }; Returns: string };
review_leave_request: { Args: { p_id: string; p_approve: boolean; p_note?: string }; Returns: number };
upsert_operator_assignment: { Args: { p_operator: string; p_location: string | null; p_date: string; p_start: number; p_end: number; p_remove?: boolean }; Returns: undefined };
copy_schedule_day: { Args: { p_location: string | null; p_source: string; p_targets: (string)[]; p_mode: string; p_preview?: boolean }; Returns: Json };
get_overlapping_colleagues: { Args: { p_start: string; p_end: string }; Returns: {work_date:string;hour:number;display_name:string}[] };
add_operator_rate: { Args: { p_operator: string; p_effective: string; p_fee: number }; Returns: string };
production_snapshot: { Args: { p_location: string | null; p_start: string; p_end: string }; Returns: Json };
production_action: { Args: { p_action: string; p_payload: Json }; Returns: Json };
manage_account: { Args: { p_id: string; p_name: string; p_role: Database['public']['Enums']['app_role']; p_location: string | null; p_employment: Database['public']['Enums']['employment_type']; p_active: boolean; p_initial_fee?: number; p_effective?: string }; Returns: undefined };
}; Enums: {app_role: "super_admin" | "operator_manager" | "staff" | "host_manager" | "host" | "admin_sales"; assignment_layer: "draft" | "published"; employment_type: "internal" | "mitra"; review_status: "pending" | "approved" | "rejected"}; CompositeTypes: {} } };
