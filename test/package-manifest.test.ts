import * as assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';

describe('package manifest branding and icons', () => {
  it('uses the fork-specific extension identity', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as { name: string; displayName: string };

    assert.equal(manifest.name, 'lin-ai-commit');
    assert.equal(manifest.displayName, 'Lin AI Commit');
  });

  it('uses the requested listing icon and Chinese description', () => {
    const workspaceRoot = process.cwd();
    const manifest = JSON.parse(
      readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')
    ) as { description: string; icon: string };

    assert.equal(manifest.description, '自动生成 Git 提交信息');
    assert.equal(manifest.icon, 'images/lin-logo.png');

    const iconPath = path.join(workspaceRoot, manifest.icon);
    const png = readFileSync(iconPath);
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(png.readUInt32BE(16), 128);
    assert.equal(png.readUInt32BE(20), 128);
    assert.ok(
      statSync(iconPath).size < 100_000,
      'Listing icon should stay below 100 KiB'
    );
  });

  it('uses a compact transparent PNG for commit generation', () => {
    const workspaceRoot = process.cwd();
    const manifest = JSON.parse(
      readFileSync(path.join(workspaceRoot, 'package.json'), 'utf8')
    ) as {
      contributes: {
        commands: Array<{
          command: string;
          icon?: { dark: string; light: string };
        }>;
      };
    };
    const generateCommand = manifest.contributes.commands.find(
      (command) => command.command === 'extension.ai-commit'
    );

    assert.deepEqual(generateCommand?.icon, {
      dark: 'images/commit-generate.png',
      light: 'images/commit-generate.png'
    });

    const iconPath = path.join(
      workspaceRoot,
      generateCommand?.icon?.dark ?? ''
    );
    const png = readFileSync(iconPath);
    assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(png.readUInt32BE(16), 64);
    assert.equal(png.readUInt32BE(20), 64);
    assert.equal(png[25], 6, 'PNG should use RGBA color data');
    assert.ok(statSync(iconPath).size < 50_000, 'Icon should stay below 50 KiB');
  });
});
