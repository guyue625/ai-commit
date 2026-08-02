import * as path from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({
    color: true,
    ui: 'tdd'
  });
  mocha.addFile(path.resolve(__dirname, 'extension-host.e2e.js'));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} Extension Host smoke test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}
