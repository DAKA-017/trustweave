const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (character) => ESCAPES[character]);

/**
 * Post-install landing page. GitHub sends the browser here with an
 * installation id; the page never accepts input and only reports state.
 */
export function renderSetupPage({
  account,
  repositorySelection,
  installationId,
  dashboardUrl,
}) {
  const owner = account ? `<strong>${escapeHtml(account)}</strong>` : 'this account';
  const scope =
    repositorySelection === 'all' ? 'all repositories' : 'the selected repositories';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TrustWeave is installed</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #0b1120; color: #e2e8f0;
    font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 34rem; padding: 2.5rem; }
  .check {
    display: inline-grid; place-items: center; width: 2.75rem; height: 2.75rem;
    border-radius: 999px; background: #0f766e; color: #ecfeff; font-size: 1.4rem;
  }
  h1 { font-size: 1.6rem; margin: 1.25rem 0 0.75rem; }
  p { color: #94a3b8; margin: 0 0 1rem; }
  a {
    display: inline-block; margin-top: 1rem; padding: 0.7rem 1.1rem;
    border-radius: 0.6rem; background: #14b8a6; color: #062e2b;
    font-weight: 600; text-decoration: none;
  }
  code { color: #cbd5e1; }
  footer { margin-top: 1.5rem; font-size: 0.8rem; color: #64748b; }
</style>
</head>
<body>
<main>
  <span class="check" aria-hidden="true">✓</span>
  <h1>TrustWeave is installed ${owner}</h1>
  <p>
    New pull requests in ${scope} will receive an advisory <strong>TrustWeave</strong> check.
    It looks for behavioral signals such as duplicate content, bursts of activity and
    low merge rates — never text origin or authorship.
  </p>
  <p>The check is advisory only. It never blocks a merge.</p>
  <a href="${escapeHtml(dashboardUrl)}">Open the TrustWeave dashboard</a>
  <footer>Installation <code>${escapeHtml(installationId)}</code></footer>
</main>
</body>
</html>`;
}
