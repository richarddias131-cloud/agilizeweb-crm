// Gerado a partir de supabase/migrations no formato do `supabase gen types typescript`.
// Para gerar de novo direto do seu projeto:
//   npx supabase gen types typescript --project-id <id> --schema public > src/lib/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12"
  }
  public: {
    Tables: {
      acoes_pendentes: {
        Row: {
          id: string
          user_id: string
          tipo: string
          lead_id: string | null
          payload: Json
          justificativa: string | null
          status: string
          decidida_em: string | null
          expira_em: string
          criada_por: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          tipo: string
          lead_id?: string | null
          payload?: Json
          justificativa?: string | null
          status?: string
          decidida_em?: string | null
          expira_em?: string
          criada_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tipo?: string
          lead_id?: string | null
          payload?: Json
          justificativa?: string | null
          status?: string
          decidida_em?: string | null
          expira_em?: string
          criada_por?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acoes_pendentes_criada_por_fkey"
            columns: ["criada_por"]
            isOneToOne: false
            referencedRelation: "api_chaves"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_pendentes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      api_chaves: {
        Row: {
          id: string
          user_id: string
          nome: string
          prefixo: string
          hash: string
          escopos: string[]
          ativa: boolean
          ultimo_uso_em: string | null
          expira_em: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          nome: string
          prefixo: string
          hash: string
          escopos?: string[]
          ativa?: boolean
          ultimo_uso_em?: string | null
          expira_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          prefixo?: string
          hash?: string
          escopos?: string[]
          ativa?: boolean
          ultimo_uso_em?: string | null
          expira_em?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      api_log: {
        Row: {
          id: string
          user_id: string
          chave_id: string | null
          metodo: string
          rota: string
          status_http: number
          duracao_ms: number
          resumo: string | null
          criado_em: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          chave_id?: string | null
          metodo: string
          rota: string
          status_http: number
          duracao_ms?: number
          resumo?: string | null
          criado_em?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          chave_id?: string | null
          metodo?: string
          rota?: string
          status_http?: number
          duracao_ms?: number
          resumo?: string | null
          criado_em?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_log_chave_id_fkey"
            columns: ["chave_id"]
            isOneToOne: false
            referencedRelation: "api_chaves"
            referencedColumns: ["id"]
          },
        ]
      }
      config: {
        Row: {
          id: string
          user_id: string
          cadencia_dias: number[]
          encerrar_apos_dias: number
          reativar_apos_dias: number
          meta_diaria: number
          whatsapp_modo: string
          tema: string
          assinatura: string | null
          whatsapp_proprio: string | null
          agente_pausado: boolean
          permitir_envio_direto_apos_resposta: boolean
          bridge_limite_diario: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          cadencia_dias?: number[]
          encerrar_apos_dias?: number
          reativar_apos_dias?: number
          meta_diaria?: number
          whatsapp_modo?: string
          tema?: string
          assinatura?: string | null
          whatsapp_proprio?: string | null
          agente_pausado?: boolean
          permitir_envio_direto_apos_resposta?: boolean
          bridge_limite_diario?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          cadencia_dias?: number[]
          encerrar_apos_dias?: number
          reativar_apos_dias?: number
          meta_diaria?: number
          whatsapp_modo?: string
          tema?: string
          assinatura?: string | null
          whatsapp_proprio?: string | null
          agente_pausado?: boolean
          permitir_envio_direto_apos_resposta?: boolean
          bridge_limite_diario?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      idempotencia: {
        Row: {
          id: string
          user_id: string
          chave_id: string
          idempotency_key: string
          status_http: number
          resposta: Json
          criado_em: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          chave_id: string
          idempotency_key: string
          status_http?: number
          resposta: Json
          criado_em?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          chave_id?: string
          idempotency_key?: string
          status_http?: number
          resposta?: Json
          criado_em?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "idempotencia_chave_id_fkey"
            columns: ["chave_id"]
            isOneToOne: false
            referencedRelation: "api_chaves"
            referencedColumns: ["id"]
          },
        ]
      }
      interacoes: {
        Row: {
          id: string
          user_id: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_interacao"]
          conteudo: string | null
          dados: Json
          template_id: string | null
          ocorreu_em: string
          ator: Database["public"]["Enums"]["ator_tipo"]
          ator_nome: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          lead_id: string
          tipo: Database["public"]["Enums"]["tipo_interacao"]
          conteudo?: string | null
          dados?: Json
          template_id?: string | null
          ocorreu_em?: string
          ator?: Database["public"]["Enums"]["ator_tipo"]
          ator_nome?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string
          tipo?: Database["public"]["Enums"]["tipo_interacao"]
          conteudo?: string | null
          dados?: Json
          template_id?: string | null
          ocorreu_em?: string
          ator?: Database["public"]["Enums"]["ator_tipo"]
          ator_nome?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interacoes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interacoes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          id: string
          user_id: string
          empresa: string
          contato_nome: string | null
          whatsapp: string
          cidade: string
          uf: string | null
          segmento: string | null
          origem: string
          link_google: string | null
          site_atual: string | null
          instagram: string | null
          nota_auditoria: number | null
          servico_interesse: string | null
          valor_estimado: number | null
          estagio: Database["public"]["Enums"]["estagio_lead"]
          motivo_perda: string | null
          proxima_acao: string | null
          proxima_acao_em: string | null
          ultimo_contato_em: string | null
          ultima_resposta_em: string | null
          tentativas_sem_resposta: number
          opt_out: boolean
          arquivado: boolean
          tags: string[]
          observacoes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          empresa: string
          contato_nome?: string | null
          whatsapp: string
          cidade?: string
          uf?: string | null
          segmento?: string | null
          origem?: string
          link_google?: string | null
          site_atual?: string | null
          instagram?: string | null
          nota_auditoria?: number | null
          servico_interesse?: string | null
          valor_estimado?: number | null
          estagio?: Database["public"]["Enums"]["estagio_lead"]
          motivo_perda?: string | null
          proxima_acao?: string | null
          proxima_acao_em?: string | null
          ultimo_contato_em?: string | null
          ultima_resposta_em?: string | null
          tentativas_sem_resposta?: number
          opt_out?: boolean
          arquivado?: boolean
          tags?: string[]
          observacoes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          empresa?: string
          contato_nome?: string | null
          whatsapp?: string
          cidade?: string
          uf?: string | null
          segmento?: string | null
          origem?: string
          link_google?: string | null
          site_atual?: string | null
          instagram?: string | null
          nota_auditoria?: number | null
          servico_interesse?: string | null
          valor_estimado?: number | null
          estagio?: Database["public"]["Enums"]["estagio_lead"]
          motivo_perda?: string | null
          proxima_acao?: string | null
          proxima_acao_em?: string | null
          ultimo_contato_em?: string | null
          ultima_resposta_em?: string | null
          tentativas_sem_resposta?: number
          opt_out?: boolean
          arquivado?: boolean
          tags?: string[]
          observacoes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_servico_interesse_fkey"
            columns: ["servico_interesse"]
            isOneToOne: false
            referencedRelation: "servicos"
            referencedColumns: ["id"]
          },
        ]
      }
      servicos: {
        Row: {
          id: string
          user_id: string
          nome: string
          preco: number
          recorrente: boolean
          preco_mensal: number | null
          ativo: boolean
          ordem: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          nome: string
          preco: number
          recorrente?: boolean
          preco_mensal?: number | null
          ativo?: boolean
          ordem?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          preco?: number
          recorrente?: boolean
          preco_mensal?: number | null
          ativo?: boolean
          ordem?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      tarefas: {
        Row: {
          id: string
          user_id: string
          lead_id: string | null
          titulo: string
          vence_em: string
          concluida_em: string | null
          origem: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          lead_id?: string | null
          titulo: string
          vence_em?: string
          concluida_em?: string | null
          origem?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string | null
          titulo?: string
          vence_em?: string
          concluida_em?: string | null
          origem?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tarefas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          id: string
          user_id: string
          chave: string | null
          nome: string
          estagio_alvo: Database["public"]["Enums"]["estagio_lead"] | null
          corpo: string
          ordem: number
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          chave?: string | null
          nome: string
          estagio_alvo?: Database["public"]["Enums"]["estagio_lead"] | null
          corpo: string
          ordem?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          chave?: string | null
          nome?: string
          estagio_alvo?: Database["public"]["Enums"]["estagio_lead"] | null
          corpo?: string
          ordem?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      vendas: {
        Row: {
          id: string
          user_id: string
          lead_id: string
          itens: Json
          valor_total: number
          forma_pagamento: string | null
          status: string
          manutencao_mensal: boolean
          valor_mensal: number
          fechada_em: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          lead_id: string
          itens?: Json
          valor_total: number
          forma_pagamento?: string | null
          status?: string
          manutencao_mensal?: boolean
          valor_mensal?: number
          fechada_em?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          lead_id?: string
          itens?: Json
          valor_total?: number
          forma_pagamento?: string | null
          status?: string
          manutencao_mensal?: boolean
          valor_mensal?: number
          fechada_em?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendas_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          id: string
          user_id: string
          url: string
          eventos: string[]
          segredo: string
          ativo: boolean
          ultimo_status: number | null
          falhas_seguidas: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          url: string
          eventos?: string[]
          segredo: string
          ativo?: boolean
          ultimo_status?: number | null
          falhas_seguidas?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          url?: string
          eventos?: string[]
          segredo?: string
          ativo?: boolean
          ultimo_status?: number | null
          falhas_seguidas?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
    }
    Views: {
      v_abordagens_dia: {
        Row: {
          user_id: string | null
          dia: string | null
          abordagens: number | null
        }
        Relationships: []
      }
      v_funil: {
        Row: {
          user_id: string | null
          estagio: Database["public"]["Enums"]["estagio_lead"] | null
          quantidade: number | null
          valor_total: number | null
        }
        Relationships: []
      }
      v_receita_mes: {
        Row: {
          user_id: string | null
          receita_paga: number | null
          receita_aguardando: number | null
          vendas: number | null
        }
        Relationships: []
      }
      v_receita_recorrente: {
        Row: {
          user_id: string | null
          receita_recorrente: number | null
          manutencoes_ativas: number | null
        }
        Relationships: []
      }
      v_taxa_resposta: {
        Row: {
          user_id: string | null
          abordados: number | null
          responderam: number | null
          taxa: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      ator_atual: {
        Args: never
        Returns: Database["public"]["Enums"]["ator_tipo"]
      }
      ator_nome_atual: {
        Args: never
        Returns: string
      }
      definir_ator: {
        Args: {
          p_ator: Database["public"]["Enums"]["ator_tipo"]
          p_ator_nome: string
        }
        Returns: undefined
      }
      encerrar_cadencia: {
        Args: {
          p_lead: string
          p_reativar_em: string
          p_ator?: Database["public"]["Enums"]["ator_tipo"]
          p_ator_nome?: string
        }
        Returns: undefined
      }
      estagio_ordem: {
        Args: {
          e: Database["public"]["Enums"]["estagio_lead"]
        }
        Returns: number
      }
      fila_hoje: {
        Args: {
          p_user?: string
        }
        Returns: Json
      }
      fim_do_dia: {
        Args: {
          p_agora?: string
        }
        Returns: string
      }
      inicializar_usuario: {
        Args: {
          p_user?: string
        }
        Returns: undefined
      }
      inicio_do_dia: {
        Args: {
          p_agora?: string
        }
        Returns: string
      }
      lead_do_usuario: {
        Args: {
          p_lead: string
        }
        Returns: Database["public"]["Tables"]["leads"]["Row"]
      }
      marcar_respondeu: {
        Args: {
          p_lead: string
          p_conteudo?: string
          p_ator?: Database["public"]["Enums"]["ator_tipo"]
          p_ator_nome?: string
        }
        Returns: string
      }
      mudar_estagio: {
        Args: {
          p_lead: string
          p_estagio: Database["public"]["Enums"]["estagio_lead"]
          p_motivo_perda?: string
          p_ator?: Database["public"]["Enums"]["ator_tipo"]
          p_ator_nome?: string
        }
        Returns: Database["public"]["Tables"]["leads"]["Row"]
      }
      registrar_envio: {
        Args: {
          p_lead: string
          p_conteudo: string
          p_template?: string
          p_estagio?: Database["public"]["Enums"]["estagio_lead"]
          p_tentativas?: number
          p_proxima_acao?: string
          p_proxima_acao_em?: string
          p_ator?: Database["public"]["Enums"]["ator_tipo"]
          p_ator_nome?: string
        }
        Returns: string
      }
    }
    Enums: {
      ator_tipo:
        | "richard"
        | "agente"
        | "bridge"
      estagio_lead:
        | "novo"
        | "abordado"
        | "respondeu"
        | "auditoria_enviada"
        | "proposta_enviada"
        | "negociacao"
        | "ganho"
        | "perdido"
        | "sem_resposta"
      tipo_interacao:
        | "whatsapp_enviado"
        | "whatsapp_recebido"
        | "ligacao"
        | "nota"
        | "auditoria"
        | "proposta"
        | "mudanca_estagio"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]
export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
