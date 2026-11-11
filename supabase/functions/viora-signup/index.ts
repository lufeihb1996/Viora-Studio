import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.119.0/cors';

const json = (body: object, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const publicKeys = Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}'));
    const apiKey = req.headers.get('apikey');
    if (!apiKey || !publicKeys.includes(apiKey)) return json({ error: 'Invalid application key.' }, 401);
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 2048) return json({ error: 'Request too large' }, 413);
    const payload = await req.json();
    const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return json({ error: 'Username must be 3–24 letters, numbers or underscores.' }, 400);
    if (password.length < 8 || password.length > 72) return json({ error: 'Password must be 8–72 characters.' }, 400);
    const url = Deno.env.get('SUPABASE_URL');
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    const key = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return json({ error: 'Registration is unavailable.' }, 503);
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';
    const hash = ip ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip)))].map(x => x.toString(16).padStart(2, '0')).join('') : null;
    const { data: allowed, error: limitError } = await admin.rpc('viora_check_signup_limit', { ip_hash: hash });
    if (limitError) return json({ error: 'Registration is unavailable.' }, 503);
    if (!allowed) return json({ error: 'Registration limit reached. Please try again later.' }, 429);
    const email = `${username}@viora.local.invalid`;
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { viora_username: username } });
    if (error) {
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return json({ error: 'Username is already in use.' }, 409);
      return json({ error: 'Unable to create account. Please try again.' }, 400);
    }
    return json({ ok: true });
  } catch (_) { return json({ error: 'Unable to create account. Please try again.' }, 400); }
});
