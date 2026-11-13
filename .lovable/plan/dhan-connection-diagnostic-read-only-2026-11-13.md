# Dhan connection diagnostic (read-only)

## Result of this check
- DHAN_CLIENT_ID configured in the check environment: **true**
- DHAN_ACCESS_TOKEN configured in the check environment: **false**
- Profile request (GET /v2/profile): **not run**. The token isn't available here, so there was no safe way to call Dhan.
- HTTP status / error category: **not available**
- tokenValidity: **not available**

Earlier session note, not re-verified: profile calls succeeded and the account was active until 09/11/2026. Quote calls failed with 401 / 806 "Data APIs not Subscribed".

## In-app step for you
1. Open the published app and sign in as the owner.
2. Go to **Settings → Dhan Connection** and press **Test Dhan Connection**.
3. Report the badge (Connected (Read-only) / Not configured / error) and the token validity date it shows.

If it says "Not configured", re-enter DHAN_ACCESS_TOKEN in Project Settings → Secrets. Dhan tokens expire every 24h, so generate a new one first. Then publish and test again.

## Scope
No files, secrets or settings change. No funds, holdings, positions, quote or order endpoints are called.
