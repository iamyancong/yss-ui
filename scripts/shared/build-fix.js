const { run } = require('dumi/dist/service/cli');
// const { resolve } = require('path');

(async () => {
  try {
    // Mimic dumi bin arguments
    // The original command is "dumi build", so args are [node, script, build]
    // We need to ensure "build" is passed to run
    // process.argv usually is [node, script, ...args]
    // If we run "node scripts/build-fix.js", argv is [node, build-fix.js]
    // We need to inject "build"

    process.argv = [...process.argv.slice(0, 2), 'build', ...process.argv.slice(2)];

    console.log('Starting dumi build...');

    // dumi/dist/cli.js uses require.resolve("./preset")
    // We need to resolve it relative to dumi package
    const presetPath = require.resolve('dumi/dist/preset');

    await run({
      presets: [presetPath],
    });

    console.log('Build finished successfully. Forcing exit...');
    process.exit(0);
  } catch (e) {
    console.error('Build failed:', e);
    process.exit(1);
  }
})();
