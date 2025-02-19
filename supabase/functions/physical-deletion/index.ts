import process from "node:process";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import type { Database } from "../_shared/types/supabase.ts";

type Config = {
  retentionDays: number;
  batchSize: number;
  maxRetries: number;
};

// Default configuration
const DEFAULT_CONFIG: Config = {
  retentionDays: 14,
  batchSize: 1000,
  maxRetries: 3,
};

type Document = {
  id: number;
};

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function deleteExpiredDocuments(
  supabaseAdmin: SupabaseClient<Database>,
  config: Config,
) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);
  const cutoffTimestamp = cutoffDate.toISOString();

  const { count } = await supabaseAdmin
    .from("documents")
    .select("id", { count: "exact", head: true })
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoffTimestamp);

  if (!count) {
    console.log("No documents to delete");
    return { deletedCount: 0, errors: [] };
  }

  const errors: Array<{ offset: number; error: string }> = [];
  let deletedCount = 0;
  let offset = 0;

  while (offset < count) {
    try {
      // Get batch of documents to delete
      const { data: documents, error: fetchError } = await supabaseAdmin
        .from("documents")
        .select("id")
        .not("deleted_at", "is", null)
        .lt("deleted_at", cutoffTimestamp)
        .range(offset, offset + config.batchSize - 1)
        .order("id");

      if (fetchError) throw fetchError;

      if (!documents?.length) break;

      const documentIds = documents.map((doc: Document) => doc.id);

      // Perform physical deletion in a transaction
      const { error: deleteError } = await supabaseAdmin.rpc(
        "physically_delete_documents",
        {
          document_ids: documentIds,
        },
      );

      if (deleteError) throw deleteError;

      deletedCount += documents.length;
      offset += config.batchSize;

      console.log(
        `Successfully deleted batch of ${documents.length} documents`,
      );
    } catch (error) {
      console.error("Error in deletion batch:", error);
      errors.push({
        offset,
        error: error instanceof Error ? error.message : String(error),
      });

      // Skip problematic batch
      offset += config.batchSize;
    }
  }

  return { deletedCount, errors };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get configuration from request or use defaults
    let config = DEFAULT_CONFIG;
    if (req.method === "POST") {
      const body = await req.json();
      config = { ...DEFAULT_CONFIG, ...body };
    }

    const result = await deleteExpiredDocuments(supabaseAdmin, config);

    return new Response(
      JSON.stringify({
        success: true,
        ...result,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error("Error in physical deletion:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
