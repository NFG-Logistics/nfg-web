# Authentication Setup - 7 Day Session Persistence

## Frontend Configuration ✅

The frontend is already configured for 7-day session persistence:
- `persistSession: true` - Sessions persist in browser storage
- `autoRefreshToken: true` - Tokens automatically refresh before expiry

## Backend Configuration Required

To enable 7-day session persistence, configure JWT expiry in Supabase:

1. Go to Supabase Dashboard → Project Settings → Authentication
2. Find "JWT expiry" or "Access Token Lifetime" setting
3. Set to **7 days** (604800 seconds)
4. Save changes

**Note:** The refresh token lifetime is typically longer (default 30 days). Users will remain logged in as long as the refresh token is valid, and the access token will auto-refresh.

## Session Behavior

- Users stay logged in for 7 days (or until refresh token expires)
- Sessions persist across page refreshes
- Auto-refresh prevents unexpected logouts
- If profile is missing → automatic signout and redirect to login
- No dummy/empty dashboard will render without valid session + profile
