// Copies the parts of three.js the game needs out of node_modules into ./vendor
// (electron-builder strips node_modules/three/examples from packaged apps, which is what broke the exe).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const three = path.join(root, 'node_modules', 'three');
const out = path.join(root, 'vendor', 'three');

if (!fs.existsSync(three)) {
  console.error('three is not installed. Run: npm install');
  process.exit(1);
}

function copy(from, to) {
  if (!fs.existsSync(from)) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  return true;
}

// core build (three.core.js only exists in newer versions, copied if present)
for (const f of ['three.module.js', 'three.core.js']) {
  copy(path.join(three, 'build', f), path.join(out, 'build', f));
}
if (!fs.existsSync(path.join(out, 'build', 'three.module.js'))) {
  console.error('three/build/three.module.js not found');
  process.exit(1);
}

// addons used by the game (launch.js, basebuild.js)
const addons = ['utils/BufferGeometryUtils.js'];
for (const a of addons) {
  if (!copy(path.join(three, 'examples', 'jsm', a), path.join(out, 'addons', a))) {
    console.error('Missing addon: ' + a);
    process.exit(1);
  }
}
console.log('vendor/three ready');
