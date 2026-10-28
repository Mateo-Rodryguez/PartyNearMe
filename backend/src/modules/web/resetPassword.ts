import { page } from "../legal/pages.js";

/**
 * The page the "reset your password" email links to. Supabase Auth checks the
 * link and sends the browser here with a short-lived session in the URL's
 * fragment (never sent to any server); the script uses it to set the new
 * password straight with Supabase. Supabase must list this page's address
 * under Auth > URL Configuration > Redirect URLs.
 */
export function resetPasswordPage(supabaseUrl: string, publishableKey: string | undefined): string {
  if (!publishableKey) {
    return page("Reset your password", "<p>Password resets aren't set up yet. Please try again later.</p>");
  }
  const settings = JSON.stringify({ auth: `${supabaseUrl}/auth/v1`, key: publishableKey }).replace(/</g, "\\u003c");
  return page(
    "Reset your password",
    `
<form id="form" hidden>
  <p>Choose a new password for your PartyNearMe account.</p>
  <p><label>New password<br><input id="password" type="password" minlength="8" autocomplete="new-password" required></label></p>
  <p><label>Type it again<br><input id="again" type="password" minlength="8" autocomplete="new-password" required></label></p>
  <p><button type="submit">Save new password</button></p>
</form>
<p id="status" role="status"></p>
<script>
(() => {
  const settings = ${settings};
  const status = document.getElementById("status");
  const form = document.getElementById("form");
  const params = new URLSearchParams(location.hash.slice(1));
  // Take the session out of the address bar so it isn't left in history or shared by accident.
  history.replaceState(null, "", location.pathname);
  const token = params.get("access_token");
  if (params.get("error") || !token || params.get("type") !== "recovery") {
    status.textContent = params.get("error_description")
      || "This link has expired or was already used. Ask for a new one from the app's sign-in screen.";
    return;
  }
  form.hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = document.getElementById("password").value;
    if (password.length < 8) { status.textContent = "Use at least 8 characters."; return; }
    if (password !== document.getElementById("again").value) { status.textContent = "The two passwords don't match."; return; }
    form.querySelector("button").disabled = true;
    status.textContent = "Saving…";
    try {
      const res = await fetch(settings.auth + "/user", {
        method: "PUT",
        headers: { apikey: settings.key, authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.msg || body.message || body.error_description || "That didn't work.");
      form.hidden = true;
      status.textContent = "Done. Go back to PartyNearMe and sign in with your new password.";
    } catch (err) {
      form.querySelector("button").disabled = false;
      status.textContent = err.message + " Try again, or ask for a new link from the app.";
    }
  });
})();
</script>`,
    `<style>
  input { font: inherit; width: 100%; max-width: 22rem; padding: .6rem .8rem; border-radius: .75rem; border: 1px solid #8884; }
  button { font: inherit; font-weight: 700; color: #fff; background: var(--accent); border: 0; border-radius: 999px; padding: .7rem 1.4rem; }
  button:disabled { opacity: .6; }
</style>
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">`,
  );
}

/** Only Supabase may be called from the page, and only its own inline script runs. */
export const resetPasswordCsp = (supabaseUrl: string) =>
  `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src ${supabaseUrl}; form-action 'none'; base-uri 'none'`;

