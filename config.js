/*
 * Where the takes go.
 *
 * Both values are safe to have here in public: the anon key is designed to sit
 * in page code, and what stops a passer-by writing anywhere is the bucket
 * policy in Supabase, not secrecy. Leave them blank and the booth still runs,
 * recording and playing back on the phone with nothing uploaded, which is
 * useful for trying the flow before any of it is set up.
 */
window.BOOTH_CONFIG = {
  url: '',   // https://YOURPROJECT.supabase.co
  key: '',   // the anon / publishable key
};
