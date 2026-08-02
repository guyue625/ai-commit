import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import { buildConfigCenterHtml } from '../src/webview/config-center-html';

describe('Config Center HTML shell', () => {
  it('uses a nonce-based CSP and only local Webview resources', () => {
    const html = buildConfigCenterHtml({
      cspSource: 'vscode-webview://config-center',
      scriptUri: 'vscode-webview://config-center/dist/webview/config-center.js',
      styleUri: 'vscode-webview://config-center/media/config-center.css',
      nonce: 'fixed-nonce',
      locale: 'zh-cn',
      title: '配置中心'
    });

    assert.match(html, /default-src 'none'/);
    assert.match(
      html,
      /script-src 'nonce-fixed-nonce' vscode-webview:\/\/config-center/
    );
    assert.match(
      html,
      /style-src vscode-webview:\/\/config-center/
    );
    assert.equal(html.includes("'unsafe-inline'"), false);
    assert.match(html, /<script nonce="fixed-nonce"/);
    assert.match(html, /<main id="app"/);
    assert.match(html, /lang="zh-cn"/);
  });

  it('escapes shell values before inserting them into HTML', () => {
    const html = buildConfigCenterHtml({
      cspSource: 'vscode-webview://safe',
      scriptUri: 'vscode-webview://safe/script.js',
      styleUri: 'vscode-webview://safe/style.css',
      nonce: 'nonce',
      locale: 'en\" onload=\"alert(1)',
      title: '<script>alert(1)</script>'
    });

    assert.equal(html.includes('<script>alert(1)</script>'), false);
    assert.equal(html.includes('onload="alert(1)'), false);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});
