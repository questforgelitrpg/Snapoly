import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const safe = p => {
  const absolute = path.resolve(p);
  if (/[/\\]OneDrive(?:[/\\]|$)/i.test(absolute)) throw new Error('Use a workspace and toolchain outside OneDrive.');
  return absolute;
};
safe(root);
if(!process.env.ANDROID_SDK_ROOT||!process.env.JAVA_HOME)throw Error('Set ANDROID_SDK_ROOT and JAVA_HOME (JDK 21); see ANDROID.md.');
const sdk = safe(process.env.ANDROID_SDK_ROOT);
const jdk = safe(process.env.JAVA_HOME);
const tools = path.join(sdk, 'build-tools', '36.0.0');
const platform = path.join(sdk, 'platforms', 'android-36', 'android.jar');
const build = safe(path.join(root, 'android/build'));
const keys = safe(path.join(root, '.keys'));
for (const directory of [build, keys, 'assets', 'classes', 'dex', 'generated', 'home', 'temp'].map(p => path.isAbsolute(p) ? p : path.join(build, p))) fs.mkdirSync(directory, { recursive: true });
const env = { ...process.env, JAVA_HOME: jdk, ANDROID_SDK_ROOT: sdk, TEMP: path.join(build, 'temp'), TMP: path.join(build, 'temp'), POLYSNAP_KEYSTORE_PASS: 'android' };
function run(executable, args) {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} failed: ${result.error || result.stderr || result.stdout}`);
  if (result.stdout.trim()) console.log(result.stdout.trim());
  if (result.stderr.trim()) console.log(result.stderr.trim());
}
const java = path.join(jdk, 'bin/java.exe');
const javaHome = `-Duser.home=${path.join(build, 'home')}`;
let html = fs.readFileSync(path.join(root, 'Snapoly.html'), 'utf8');
html = html.replace('<head>', '<head><meta name="polysnap-native" content="android">')
  .replace(/\s*<link rel="(?:manifest|apple-touch-icon|icon)"[^>]*>/g, '');
fs.writeFileSync(path.join(build, 'assets/game.html'), html);
const res = path.join(build, 'res');
fs.cpSync(path.join(root, 'android/src/res'), res, { recursive: true });
fs.mkdirSync(path.join(res, 'drawable'), { recursive: true });
fs.copyFileSync(path.join(root, 'public/icons/icon-512.png'), path.join(res, 'drawable/icon.png'));
run(path.join(tools, 'aapt2.exe'), ['compile', '--dir', res, '-o', path.join(build, 'resources.zip')]);
run(path.join(tools, 'aapt2.exe'), ['link', '-o', path.join(build, 'unsigned.apk'), '-I', platform, '--manifest', path.join(root, 'android/src/AndroidManifest.xml'), '--java', path.join(build, 'generated'), '--min-sdk-version', '26', '--target-sdk-version', '35', '--version-code', '11', '--version-name', '0.5.1', '-A', path.join(build, 'assets'), path.join(build, 'resources.zip')]);
run(path.join(jdk, 'bin/javac.exe'), ['-J'+javaHome, '-source', '8', '-target', '8', '-bootclasspath', platform, '-d', path.join(build, 'classes'), path.join(root, 'android/src/java/com/polysnap/prototype/MainActivity.java')]);
const classes = fs.readdirSync(path.join(build, 'classes'), { recursive: true }).filter(p => p.endsWith('.class')).map(p => path.join(build, 'classes', p));
run(java, [javaHome, '-cp', path.join(tools, 'lib/d8.jar'), 'com.android.tools.r8.D8', '--lib', platform, '--min-api', '26', '--output', path.join(build, 'dex'), ...classes]);
run(path.join(jdk, 'bin/jar.exe'), ['--update', '--file', path.join(build, 'unsigned.apk'), '-C', path.join(build, 'dex'), 'classes.dex']);
run(path.join(tools, 'zipalign.exe'), ['-f', '-p', '4', path.join(build, 'unsigned.apk'), path.join(build, 'aligned.apk')]);
const keystore = path.join(keys, 'polysnap-test.jks');
if (!fs.existsSync(keystore)) run(path.join(jdk, 'bin/keytool.exe'), ['-J'+javaHome, '-genkeypair', '-keystore', keystore, '-storepass:env', 'POLYSNAP_KEYSTORE_PASS', '-keypass:env', 'POLYSNAP_KEYSTORE_PASS', '-alias', 'polysnap-test', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Snapoly Test, O=Snapoly Prototype, C=US']);
const apk = path.join(build, 'Snapoly-0.5.1-debug.apk');
run(java, [javaHome, '-jar', path.join(tools, 'lib/apksigner.jar'), 'sign', '--ks', keystore, '--ks-key-alias', 'polysnap-test', '--ks-pass', 'env:POLYSNAP_KEYSTORE_PASS', '--key-pass', 'env:POLYSNAP_KEYSTORE_PASS', '--out', apk, path.join(build, 'aligned.apk')]);
run(java, [javaHome, '-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', apk]);
run(path.join(tools, 'aapt2.exe'), ['dump', 'badging', apk]);
console.log(`Android test APK: ${apk}`);
