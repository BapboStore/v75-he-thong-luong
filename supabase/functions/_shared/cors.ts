// Shared CORS headers cho mọi Edge Function của V75.
// Cho phép app từ Netlify gọi qua fetch. Origin '*' OK vì auth bằng JWT/anon key.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
