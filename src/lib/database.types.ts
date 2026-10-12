// Tipos do banco. Na Fase 2 este arquivo passa a refletir as migrations
// (gerar de novo com: npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
