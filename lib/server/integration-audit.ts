import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Audit log entry for integration API access.
 * Does NOT store bearer tokens, authorization headers, or visitor personal information.
 */
export interface IntegrationAuditEntry {
  integrationKeyId: string | null;
  integrationName: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  outcome: 'success' | 'client_error' | 'server_error' | 'auth_failure' | 'rate_limited';
  requestId: string | null;
  responseTimeMs: number | null;
  resultCount: number | null;
  createdAt: string;
}

/**
 * Logs an API access event for auditing and monitoring.
 * Does NOT log bearer tokens, authorization headers, or visitor personal information.
 */
export async function logApiAccess({
  integrationKeyId,
  integrationName,
  endpoint,
  method,
  statusCode,
  outcome,
  requestId,
  responseTimeMs,
  resultCount,
}: {
  integrationKeyId: string | null;
  integrationName: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  outcome: 'success' | 'client_error' | 'server_error' | 'auth_failure' | 'rate_limited';
  requestId?: string | null;
  responseTimeMs?: number | null;
  resultCount?: number | null;
}): Promise<void> {
  if (!supabaseAdmin) {
    console.error('[Audit] supabaseAdmin not configured; cannot log audit event');
    return;
  }

  try {
    await supabaseAdmin.from('api_integration_audit_logs').insert({
      integration_key_id: integrationKeyId,
      integration_name: integrationName,
      endpoint,
      method,
      status_code: statusCode,
      outcome,
      request_id: requestId,
      response_time_ms: responseTimeMs,
      result_count: resultCount,
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}