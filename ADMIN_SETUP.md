# HEI Fleet Manager — one-time secure setup

This branch introduces /admin.html and Cloudflare Pages Functions under /functions/api/.
It reuses the current GitHub repository and data/workshop-v2.json. No new paid CMS is required.

**IMPORTANT: Do not use the admin interface until Cloudflare Access and server-side secrets are configured.**
The admin UI and API intentionally refuse administrative requests until configured.

1. Open Cloudflare Zero Trust → Access → Applications. Create a **self-hosted application** covering BOTH:
   - https://YOUR_SITE_DOMAIN/admin.html
   - https://YOUR_SITE_DOMAIN/api/*
   Limit access to **your own email address** via a specific email-allow rule.
   Do not use a public allow rule. Require an OTP or appropriate identity-provider login.
   Note the Access **Application Audience (AUD)** value and your **team domain**, e.g. example.cloudflareaccess.com.
   Both paths must be protected; a private admin page alone is insufficient.

2. In the Cloudflare Pages project settings → Variables and Secrets, add **encrypted secrets**:
   - GITHUB_TOKEN = fine-grained GitHub token restricted to HEIshipyards/HEIshipyards, repository Contents: Read and write, Metadata: Read.
   - CF_ACCESS_TEAM_DOMAIN = your-team.cloudflareaccess.com (no protocol).
   - CF_ACCESS_AUD = application AUD for **/api/** (use the same Access application AUD for both paths or configure the API application AUD).
   - ADMIN_EMAIL = the exact email address allowed to publish.

   Never put these secrets in GitHub files, client HTML, or Pages environment variables exposed to the browser. Use the Cloudflare encrypted secrets interface. Prefer a short-lived fine-grained token and rotate it on expiry.

3. Deploy the branch on a Cloudflare Pages preview. Verify:
   - /admin.html demands an Access login
   - /api/fleet returns 401 without a valid Access session
   - /api/upload returns 401 without a valid Access session
   - Signed-in /api/fleet lists 28 entries; upload a small test image; publish a gallery change
   - The public website displays it after deployment

4. After testing, merge the branch into main.

Notes:
- The API verifies Cloudflare Access JWT signatures and the approved email. It only writes to two allowed GitHub paths: data/workshop-v2.json and assets/fleet/<Workshop ID>/<random image>.
- Images are limited to JPEG, PNG, WebP, 3.5 MB each. Publishing detects simultaneous edits via the GitHub blob SHA.
- The existing custom HEI vessel lore, layout and workshop links are preserved. The manager edits the fleet registry's title, category, description, cover and gallery.
- Images are public once published. Newly uploaded images not yet assigned to a vessel are retained as unreferenced assets; cleaning those can be a later feature.
- This solution requires hosting as a Cloudflare Pages project with Functions support. A pure static GitHub Pages site cannot execute the API.
- If the site is deployed from a **build output directory**, ensure /functions is in the Git-connected root Cloudflare Pages picks up for Functions.
