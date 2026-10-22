# Moonlight: Import, Run and Publish

This plan takes the uploaded "moonlight-main" project, gets it running in the preview environment, and then publishes it to a live URL.
The goal is to keep the app the same as the original. The only changes are the ones it needs to run on this platform.

## Who it's for
- The project owner, who wants their existing Moonlight code online without rebuilding it.
- The owner's end users, who will reach it through the published link.

## Core features and experience
- All pages, features, content, styling and assets from the uploaded project stay the same.
- The app opens in preview and can be clicked through before anything goes live.
- If the project has a backend or database, it is connected so that its existing features keep working.
- Each outside service the code depends on is listed, such as payments, AI, email or login. Any keys it needs are requested only when they are actually required.
- Once preview works, the app gets a live public URL.

## User flow
1. The uploaded zip is unpacked and its contents are reviewed.
2. The project is placed into the workspace and adapted only where it has to be, such as configuration, ports, environment settings and the API path prefix.
3. The owner opens the preview, checks that it looks and behaves like the original, and reports any differences.
4. Missing keys or credentials are requested from the owner if the code needs them.
5. The app is published, and the owner gets a live URL.

## UI/UX feel
- The design stays the same as the uploaded project. Nothing is redesigned or restyled.
- Visual fixes happen only if something breaks during the move.

## Implementation phases
**Phase 1: MVP (built now)**
- Unpack and review the project.
- Get it running in preview with as few changes as possible.
- Confirm that the main pages and flows work.
- Publish to a live URL.

**Phase 2**
- Fix any behaviour differences the owner spots between the original and the live version.
- Connect any remaining outside services once keys are provided.

**Phase 3**
- Add a custom domain and production polish, such as performance, SEO and error pages.
- Add new features or enhancements the owner asks for.

## Assumptions
- Unanswered clarifying questions were resolved with these defaults.
- The project is kept as close to the original as possible. It is not rewritten into a different tech stack. Parts are adapted only when they cannot run here as they are.
- If the project is static (a front end only), it is served as is without adding a backend.
- If it has a backend or database, that part is reworked as little as possible to fit the platform's server and database.
- Publishing happens automatically once the app works in preview. The platform may charge for the first deploy, and the owner is asked to confirm that charge.
- Outside services that need keys are left off until the owner provides the keys. These are clearly marked as not connected and are not faked.
- No new features, redesigns or content changes are part of this phase.
