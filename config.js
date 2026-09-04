/*
 * Where the takes go.
 *
 * Both values are safe to have here in public: the publishable key is designed
 * to sit in page code, and what stops a passer-by writing anywhere is the
 * bucket policy in Supabase, not secrecy. The one that must never appear here
 * is the service_role key.
 *
 * Leave them blank and the booth still runs, recording and playing back on the
 * phone with nothing uploaded.
 */
window.BOOTH_CONFIG = {
  url: 'https://mhquiiaivhwhwsjywzmo.supabase.co',
  key: 'sb_publishable_a1C8A0NM5TRzEMMkYgJy5Q_X_oC0irv',
};
