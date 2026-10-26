// Типи схеми бази. Оновлюйте разом із міграцією: готовий файл — у Summary прогону job db-check у CI
// (supabase gen types typescript --local на одноразовій базі); або npm run db:types після npx supabase link на ваш проєкт. Ця версія написана вручну
// й описує міграції 20261012000000_profiles_and_roles.sql, 20261020203434_leave_schema.sql
// 20261021080359_submit_leave_request.sql і 20261026201058_leave_decisions.sql.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          full_name: string | null;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string | null;
          full_name?: string | null;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      divisions: {
        Row: {
          id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      positions: {
        Row: {
          id: string;
          employee_id: string;
          division_id: string;
          kind: string;
          job_title: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          division_id: string;
          kind: string;
          job_title: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          division_id?: string;
          kind?: string;
          job_title?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "positions_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "positions_division_id_fkey";
            columns: ["division_id"];
            isOneToOne: false;
            referencedRelation: "divisions";
            referencedColumns: ["id"];
          },
        ];
      };
      position_managers: {
        Row: {
          position_id: string;
          manager_id: string;
          created_at: string;
        };
        Insert: {
          position_id: string;
          manager_id: string;
          created_at?: string;
        };
        Update: {
          position_id?: string;
          manager_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "position_managers_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "position_managers_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      schedule_blocks: {
        Row: {
          id: string;
          position_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          position_id: string;
          weekday: number;
          starts_at: string;
          ends_at: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          position_id?: string;
          weekday?: number;
          starts_at?: string;
          ends_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_requests: {
        Row: {
          id: string;
          employee_id: string;
          leave_type: string;
          relationship: string | null;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          employee_id: string;
          leave_type: string;
          relationship?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          employee_id?: string;
          leave_type?: string;
          relationship?: string | null;
          comment?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_records: {
        Row: {
          id: string;
          request_id: string;
          position_id: string;
          on_date: string;
          starts_at: string;
          ends_at: string;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          position_id: string;
          on_date: string;
          starts_at: string;
          ends_at: string;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          request_id?: string;
          position_id?: string;
          on_date?: string;
          starts_at?: string;
          ends_at?: string;
          status?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_records_request_id_fkey";
            columns: ["request_id"];
            isOneToOne: false;
            referencedRelation: "leave_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_records_position_id_fkey";
            columns: ["position_id"];
            isOneToOne: false;
            referencedRelation: "positions";
            referencedColumns: ["id"];
          },
        ];
      };
      leave_decisions: {
        Row: {
          id: string;
          record_id: string;
          decided_by: string;
          decision: string;
          comment: string | null;
          decided_at: string;
        };
        Insert: {
          id?: string;
          record_id: string;
          decided_by: string;
          decision: string;
          comment?: string | null;
          decided_at?: string;
        };
        Update: {
          id?: string;
          record_id?: string;
          decided_by?: string;
          decision?: string;
          comment?: string | null;
          decided_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "leave_decisions_record_id_fkey";
            columns: ["record_id"];
            isOneToOne: false;
            referencedRelation: "leave_records";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_decisions_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      submit_leave_request: {
        Args: {
          p_leave_type: string;
          p_relationship: string | null;
          p_comment: string | null;
          p_records: Json;
        };
        Returns: string;
      };
      decide_leave_record: {
        Args: {
          p_record_id: string;
          p_decision: string;
          p_comment: string | null;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
