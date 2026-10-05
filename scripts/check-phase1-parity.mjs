import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const files={
  web:fs.readFileSync(path.join(root,'frontend/src/App.tsx'),'utf8'),
  android:fs.readFileSync(path.join(root,'android/app/src/main/assets/index.html'),'utf8'),
  androidNative:fs.readFileSync(path.join(root,'android/app/src/main/java/com/korczak/documents/MainActivity.kt'),'utf8'),
  androidStorage:fs.readFileSync(path.join(root,'android/app/src/main/java/com/korczak/documents/StorageManager.kt'),'utf8'),
  androidManifest:fs.readFileSync(path.join(root,'android/app/src/main/AndroidManifest.xml'),'utf8'),
  ios:fs.readFileSync(path.join(root,'ios/KZDocuments/ContentView.swift'),'utf8')
};
const checks=[
  ['Web: documents',files.web.includes("api.documents()")],
  ['Web: folders',files.web.includes("api.folders()")],
  ['Web: favorites',files.web.includes("api.favorites()")],
  ['Web: recent',files.web.includes("api.recent()")],
  ['Web: trash',files.web.includes("api.trash()")],
  ['Web: quick search',files.web.includes("api.search(")],
  ['Web: advanced search',files.web.includes("api.advancedSearch(")],
  ['Web: users',files.web.includes("api.users()")],
  ['Web: groups',files.web.includes("api.groups()")],
  ['Web: permissions',files.web.includes("api.permissions(")],
  ['Web: audit',files.web.includes("api.audit(")],
  ['Web: NexusAPI',files.web.includes('NexusAPI')],
  ['Web: feedback',files.web.includes("api.feedback(")],
  ['Web: updates',files.web.includes("releases/latest")],
  ['Android: generic NexusAPI bridge',files.android.includes("native('api'")],
  ['Android: native API transport',files.androidNative.includes('"api" ->') && files.androidNative.includes('api.request(')],
  ['Android: management API transport',files.androidNative.includes('response.code in 200..299')],
  ['Android: NexusAPI',files.android.includes('>NexusAPI<')],
  ['Android: feedback',files.android.includes('Dar um feedback')],
  ['Android: updates',files.android.includes('Atualizações')],
  ['Android: native splash',files.androidNative.includes('showNativeSplash') && files.androidNative.includes('hideNativeSplash')],
  ['Android: system insets',files.androidNative.includes('WindowInsetsCompat.Type.systemBars') && files.android.includes('--nx-native-bottom-inset')],
  ['Android: back navigation',files.android.includes('function handleBack()') && files.androidNative.includes('window.handleBack')],
  ['Android: local trash bridge',files.androidNative.includes('"trashFile"') && files.androidNative.includes('"restoreTrash"') && files.androidNative.includes('"permanentDeleteTrash"')],
  ['Android: persistent trash storage',files.androidStorage.includes('trashEntries') || files.androidStorage.includes('trashPrefsKey')],
  ['Android: share intent',files.androidNative.includes('ACTION_SEND') && files.androidManifest.includes('android.intent.action.SEND')],
  ['Android: resize-aware activity',files.androidManifest.includes('android:windowSoftInputMode="adjustResize"')],
  ['iOS: current Nexus URL',files.ios.includes('https://korczaktech.github.io/kz-nexus/')]
];
const failed=checks.filter(([,ok])=>!ok);
for(const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} — ${name}`);
if(failed.length){console.error(`Fase 1: ${failed.length} verificações falharam.`);process.exit(1)}
console.log(`Fase 1: ${checks.length} verificações passaram.`);
