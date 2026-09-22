// Deno Edge Function entry point — thin glue only.
//
// All authorization and response logic lives in handler.ts so it can be
// unit tested with this repo's existing Node-based test runner. Do not add
// business logic here.
//
// Deployment requirement: Supabase Dashboard's
// "Verify JWT with legacy secret" setting is OFF for this function.
// Authentication is enforced by withSupabase({ auth: 'user' }), which
// validates the caller before the handler runs and supplies:
//   - ctx.supabase      — RLS-scoped to the caller
//   - ctx.supabaseAdmin — service-role, bypasses RLS
//
// The deployed QA function has been live-validated end-to-end, including
// missing credentials, invalid JWTs, authorized reads, unauthorized reads,
// and immediate authorization revocation/restoration with the same JWT.
import { withSupabase } from '@supabase/server';
import { handleTaskCompletionEvidenceRequest } from './handler.ts';

export default {
  fetch: withSupabase({ auth: 'user' }, async (req, ctx) =>
    handleTaskCompletionEvidenceRequest(req, ctx),
  ),
};
