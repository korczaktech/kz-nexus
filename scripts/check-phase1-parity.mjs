import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const files = {
  web: read('frontend/src/App.tsx'),
  androidNative: read('android/app/src/main/java/com/korczak/documents/MainActivity.kt'),
  androidApi: read('android/app/src/main/java/com/korczak/documents/ApiClient.kt'),
  androidStorage: read('android/app/src/main/java/com/korczak/documents/StorageManager.kt'),
  androidManifest: read('android/app/src/main/AndroidManifest.xml'),
  androidUpdater: read('android/app/src/main/java/com/korczak/documents/Updater.kt'),
  ios: read('ios/KZDocuments/ContentView.swift')
};

const nativeAssetPath = path.join(
  root,
  'android/app/src/main/assets/index.html'
);

const checks = [
  ['Web: documents', files.web.includes('api.documents()')],
  ['Web: folders', files.web.includes('api.folders()')],
  ['Web: favorites', files.web.includes('api.favorites()')],
  ['Web: recent', files.web.includes('api.recent()')],
  ['Web: trash', files.web.includes('api.trash()')],
  ['Web: quick search', files.web.includes('api.search(')],
  ['Web: advanced search', files.web.includes('api.advancedSearch(')],
  ['Web: users', files.web.includes('api.users()')],
  ['Web: groups', files.web.includes('api.groups()')],
  ['Web: permissions', files.web.includes('api.permissions(')],
  ['Web: audit', files.web.includes('api.audit(')],
  ['Web: NexusAPI', files.web.includes('NexusAPI')],
  ['Web: feedback', files.web.includes('api.feedback(')],
  ['Web: updates', files.web.includes('releases/latest')],

  ['Android: native Activity', files.androidNative.includes('class MainActivity : AppCompatActivity()')],
  ['Android: native authentication', files.androidNative.includes('private fun showAuth()') && files.androidNative.includes('api.login(') && files.androidNative.includes('api.register(')],
  ['Android: native home', files.androidNative.includes('private fun renderHome()')],
  ['Android: native files', files.androidNative.includes('private fun renderFiles()') && files.androidNative.includes('api.documents()')],
  ['Android: native search', files.androidNative.includes('api.search(')],
  ['Android: native folders', files.androidNative.includes('api.folders()') && files.androidNative.includes('showCreateFolder()')],
  ['Android: native editor', files.androidNative.includes('private fun renderEditor(') && files.androidNative.includes('api.updateDocument(')],
  ['Android: native models', files.androidNative.includes('private fun renderModels()')],
  ['Android: native storage', files.androidNative.includes('private fun renderStoragePage()') && files.androidNative.includes('ACTION_OPEN_DOCUMENT_TREE')],
  ['Android: native more', files.androidNative.includes('private fun renderMore()')],
  ['Android: native settings/plan/history', files.androidNative.includes('renderSettings()') && files.androidNative.includes('renderPlan()') && files.androidNative.includes('renderHistory()')],
  ['Android: native favorites/trash', files.androidNative.includes('renderFavoritesPage()') && files.androidNative.includes('renderTrashPage()')],
  ['Android: native splash', files.androidNative.includes('showStartupSplash()') && files.androidNative.includes('showStartupFailure(')],
  ['Android: native system configuration', files.androidNative.includes('WindowCompat.setDecorFitsSystemWindows(window, true)')],
  ['Android: native API client', files.androidApi.includes('private val base =') && files.androidApi.includes('fun request(') && files.androidApi.includes('fun documents()') && files.androidApi.includes('fun search(')],
  ['Android: no WebView', !files.androidNative.includes('android.webkit.WebView') && !fs.existsSync(nativeAssetPath)],
  ['Android: persistent trash storage', files.androidStorage.includes('trashEntries') || files.androidStorage.includes('trashPrefsKey')],
  ['Android: local trash operations', files.androidStorage.includes('restoreTrash(') && files.androidStorage.includes('permanentDeleteTrash(')],
  ['Android: share intent', files.androidNative.includes('Intent.ACTION_SEND') && files.androidManifest.includes('android.intent.action.SEND')],
  ['Android: resize-aware activity', files.androidManifest.includes('android:windowSoftInputMode="adjustResize"')],
  ['Android: updater integrity', files.androidUpdater.includes('MessageDigest') && files.androidUpdater.includes('/releases/download/') && files.androidUpdater.includes('sha256')],
  ['Android: update UI', files.androidNative.includes('Atualizações') && files.androidNative.includes('Updater(this).check')],
  ['Android: NexusAPI', files.androidNative.includes('API: NexusAPI')],
  ['Android: feedback', files.androidNative.includes('NexusFeedback')],
  ['iOS: current Nexus URL', files.ios.includes('https://nexus.korczaktech.com.br/') && files.ios.includes('https://nexus.korczaktech.com.br/')]
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}`);
}

if (failed.length) {
  console.error(`Fase 1: ${failed.length} verificações falharam.`);
  process.exit(1);
}

console.log(`Fase 1: ${checks.length} verificações passaram.`);
