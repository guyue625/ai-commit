"""Run after npm run build && npm run compile-tests; requires Python Playwright + Chrome."""
import json
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
translations = json.loads(subprocess.check_output([
    'node', '-e', "process.stdout.write(JSON.stringify(require('./out/src/webview/i18n.js').getTranslations('zh-cn')))"
], cwd=root, text=True, encoding='utf-8'))
view = {
    'locale': 'zh-cn', 'translations': translations,
    'providerCounts': {'openai': 0, 'anthropic': 1},
    'settings': {'language': 'English', 'systemPrompt': ''},
    'transfer': {'legacyAvailable': False},
    'profiles': [{
        'id': 'example', 'provider': 'anthropic', 'name': 'Personal',
        'baseUrl': 'https://example.com', 'model': 'deepseek-v4-flash',
        'keyHint': 'sk-****1234', 'hasLocalKey': True, 'isActive': False,
        'isDefault': False, 'createdAt': 1, 'updatedAt': 1,
        'options': {'temperature': 0.7}
    }]
}
models = ['deepseek-v4-flash', 'claude-sonnet-4-5', 'gpt-5-mini', '<img src=x onerror=alert(1)>']
theme = ''':root {
--vscode-font-family: 'Segoe UI', sans-serif; --vscode-font-size: 14px;
--vscode-foreground: #c9d1d9; --vscode-editor-background: #25292f;
--vscode-descriptionForeground: #a4adba; --vscode-panel-border: #424850;
--vscode-sideBar-background: #21252b; --vscode-input-background: #1c1f24;
--vscode-input-foreground: #d9dfe8; --vscode-input-border: #424850;
--vscode-button-background: #4674c7; --vscode-button-foreground: #fff;
--vscode-button-hoverBackground: #5586d8; --vscode-focusBorder: #619cff;
--vscode-list-activeSelectionBackground: #303844; --vscode-list-activeSelectionForeground: #fff;
--vscode-editorWidget-background: #21252b; --vscode-textLink-foreground: #6fa5ff;
--vscode-dropdown-background: #21252b; --vscode-dropdown-foreground: #c9d1d9;
}'''
css = (root / 'media/config-center.css').read_text(encoding='utf-8')
if '--baseline-css' in sys.argv:
    css = subprocess.check_output(['git', 'show', 'HEAD:media/config-center.css'], cwd=root, text=True, encoding='utf-8')

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True, channel='chrome')
    page = browser.new_page(viewport={'width': 1308, 'height': 1100})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content('<html><head><meta charset="utf-8"></head><body><main id="app"></main></body></html>')
    page.add_style_tag(content=theme + css)
    page.evaluate('''() => {
      window.requests = [];
      window.acquireVsCodeApi = () => ({
        postMessage: request => window.requests.push(request),
        getState: () => ({section: 'anthropic'}), setState: () => {}
      });
    }''')
    page.add_script_tag(path=str(root / 'dist/webview/config-center.js'))

    def respond(model_list=None):
        request = page.evaluate('window.requests.at(-1)')
        data = {'view': view}
        if model_list is not None:
            data['models'] = model_list
        page.evaluate('(response) => window.dispatchEvent(new MessageEvent("message", {data: response}))',
                      {'requestId': request['requestId'], 'ok': True, 'data': data})

    respond()
    page.locator('[data-action="edit-profile"]').click()
    api_key = page.locator('input[name="apiKey"]').bounding_box()
    key_label = page.locator('input[name="keyLabel"]').bounding_box()
    assert abs(api_key['y'] - key_label['y']) <= 1, (api_key, key_label)
    assert abs(api_key['height'] - key_label['height']) <= 1
    page.locator('input[name="keyLabel"]').fill('Unsaved label')
    model_input = page.locator('input[name="model"]')
    page.locator('[data-action="fetch-models"]').click()
    assert page.evaluate('window.requests.at(-1).type') == 'profile.models'
    respond(models)
    assert page.evaluate('document.activeElement.id') == 'profile-model'
    page.keyboard.press('ArrowDown')
    assert model_input.get_attribute('aria-activedescendant') == 'model-option-0'
    page.keyboard.press('Escape')
    assert page.locator('#model-options').is_hidden()
    page.locator('[data-action="toggle-models"]').click()
    options = page.locator('#model-options [role="option"]')
    assert options.all_text_contents() == models  # Existing value must not filter on open.
    assert model_input.input_value() == 'deepseek-v4-flash'
    assert page.locator('input[name="keyLabel"]').input_value() == 'Unsaved label'
    assert page.locator('#model-options img').count() == 0  # Treat model names as text.
    options.filter(has_text='claude-sonnet-4-5').click()
    assert model_input.input_value() == 'claude-sonnet-4-5'
    assert page.locator('#model-options').is_hidden()
    page.locator('[data-action="toggle-models"]').click()
    assert options.all_text_contents() == models
    model_input.fill('gpt')
    assert options.all_text_contents() == ['gpt-5-mini']
    model_input.press('Escape')
    assert model_input.input_value() == 'gpt'
    page.locator('[data-action="toggle-models"]').click()
    assert options.all_text_contents() == models
    model_input.press('ArrowDown')
    assert model_input.get_attribute('aria-activedescendant') == 'model-option-0'
    model_input.press('ArrowDown')
    model_input.press('Enter')
    assert model_input.input_value() == 'claude-sonnet-4-5'
    assert page.evaluate('window.requests.length') == 2  # Enter selected; it did not save.
    model_input.press('ArrowUp')
    assert options.count() == len(models)
    model_input.press('Escape')
    model_input.click()
    assert options.count() == len(models)
    model_input.press('Tab')
    assert page.locator('#model-options').is_hidden()
    page.locator('[data-action="fetch-models"]').click()
    page.locator('input[name="keyLabel"]').focus()
    respond(models)
    assert page.evaluate('document.activeElement.name') == 'keyLabel'
    assert page.locator('#model-options').is_hidden()
    page.locator('[data-action="toggle-models"]').click()
    assert page.locator('#model-options').evaluate('(node) => getComputedStyle(node).backgroundColor') == 'rgb(33, 37, 43)'
    page.screenshot(path=str(root / 'out/model-picker-dark.png'), full_page=True)
    page.add_style_tag(content=':root { --vscode-dropdown-background: #ffffff; --vscode-dropdown-foreground: #222222; }')
    assert page.locator('#model-options').evaluate('(node) => getComputedStyle(node).backgroundColor') == 'rgb(255, 255, 255)'
    assert page.locator('#model-options').evaluate('(node) => getComputedStyle(node).color') == 'rgb(34, 34, 34)'
    page.locator('input[name="name"]').click()
    assert page.locator('#model-options').is_hidden()
    page.set_viewport_size({'width': 600, 'height': 1000})
    page.locator('[data-action="toggle-models"]').click()
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
    model_input.fill('my-custom-model')
    assert options.count() == 0
    assert page.locator('.model-picker__empty').inner_text() == translations['noMatchingModels']
    page.locator('[data-submit="save"]').click()
    request = page.evaluate('window.requests.at(-1)')
    assert request['type'] == 'profile.update'
    assert request['payload']['changes']['model'] == 'my-custom-model'
    assert request['payload']['changes']['keyLabel'] == 'Unsaved label'
    assert not errors, errors
    browser.close()

print('PASS: full-list opening, filtering, click/keyboard selection, custom names, draft preservation, field alignment, themes and narrow layout')
