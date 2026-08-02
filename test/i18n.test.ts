import assert from 'node:assert/strict';
import { describe, it } from 'mocha';
import {
  EN_TRANSLATIONS,
  getTranslations,
  ZH_CN_TRANSLATIONS
} from '../src/webview/i18n';

describe('i18n', () => {
  it('keeps English and Simplified Chinese translation keys identical', () => {
    assert.deepEqual(
      Object.keys(ZH_CN_TRANSLATIONS).sort(),
      Object.keys(EN_TRANSLATIONS).sort()
    );
  });

  it('uses Simplified Chinese for zh-cn and zh-hans locales', () => {
    assert.equal(getTranslations('zh-cn').configCenterTitle, '配置中心');
    assert.equal(getTranslations('zh-Hans').activeProfile, '当前生效配置');
  });

  it('falls back to English for all other locales', () => {
    assert.equal(getTranslations('fr').configCenterTitle, 'Config Center');
    assert.equal(getTranslations(undefined).saveAndActivate, 'Save and Activate');
  });
});
