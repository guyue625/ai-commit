export interface ConfigCenterHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
  locale: string;
  title: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] ?? character
  );
}

export function buildConfigCenterHtml(
  options: ConfigCenterHtmlOptions
): string {
  const cspSource = escapeHtml(options.cspSource);
  const nonce = escapeHtml(options.nonce);
  const scriptUri = escapeHtml(options.scriptUri);
  const styleUri = escapeHtml(options.styleUri);
  const locale = escapeHtml(options.locale);
  const title = escapeHtml(options.title);
  const csp = [
    "default-src 'none'",
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}' ${cspSource}`,
    `font-src ${cspSource}`,
    `img-src ${cspSource} data:`,
    "connect-src 'none'"
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="${locale}">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="${styleUri}">
  </head>
  <body>
    <main id="app" aria-live="polite"></main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}
