# Authentication Testing Playbook

## Database verification

- Confirm `users` has unique organization/email and global normalized-email indexes as configured.
- Confirm password hashes start with bcrypt `$2b$` and are never returned by APIs.
- Confirm TTL indexes exist for sessions, invitations, password resets and MFA challenges.
- Confirm invitation and reset documents store only token hashes, expiry and used timestamps.
- Confirm MFA secrets are encrypted and recovery codes are hashed.

## Required flows

1. Admin creates a synthetic parent invitation with one or more child grants.
2. Invitation token works once, expires, cannot be replayed and creates the expected grants.
3. Invited user signs in using email/password and receives a secure HttpOnly session cookie.
4. Generic forgot-password response does not reveal whether an account exists.
5. Reset token works once; password reset revokes every existing session.
6. Staff/admin can enroll TOTP, verify login with TOTP and use a one-time recovery code.
7. Invalid login and MFA attempts trigger configured rate limits without logging credentials/codes.
8. User lists sessions, revokes one session and revokes all other sessions.
9. Admin deactivation immediately invalidates active sessions and protected API access.
10. Guardian grant revocation immediately removes child, plan and media visibility.

## Browser verification

- Login, invite acceptance, recovery and MFA forms expose clear loading/error/success states.
- All interactive elements and critical status text have unique `data-testid` attributes.
- Keyboard-only navigation works and focus remains visible.
- Mobile forms fit at 390 px without horizontal scrolling.

## Security checks

- CSRF is required for authenticated unsafe methods.
- Cookies are Secure, HttpOnly and use the configured SameSite policy.
- Origin validation rejects unknown origins.
- Cross-tenant IDs return 404 rather than revealing existence.
- No secret, password, raw token, MFA code or child content appears in logs or audit metadata.