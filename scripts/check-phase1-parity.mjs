import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const files = {
  web: read('frontend/src/App.tsx'),
  editor: read('frontend/src/components/Editor.tsx'),
  editorSearch: read('frontend/src/components/editorTextSearch.ts'),
  editorRtf: read('frontend/src/components/editorRtf.ts'),
  editorMerge: read('frontend/src/components/editorMerge.ts'),
  app: read('frontend/src/App.tsx'),
  editorFormats: read('frontend/src/components/editorFormats.ts'),
  editorPdf: read('frontend/src/components/editorPdf.ts'),
  cloudStorage: read('frontend/src/services/cloudStorage.ts'),
  sheetsFormatting: read('frontend/src/services/googleSheetsFormatting.ts'),
  slidesFormatting: read('frontend/src/services/googleSlidesFormatting.ts'),
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
  ['Editor: paginated preview', files.editor.includes('PagedPreview') && files.editor.includes('Visualizar páginas')],
  ['Editor: scanned PDF OCR', files.editor.includes("createWorker('por+eng')") && files.editor.includes('item.page.render')],
  ['Editor: embedded image upload', files.editor.includes('imageInputRef') && files.editor.includes('insertImageFile')],
  ['Editor: find across formatted nodes', files.editor.includes('replaceTextAcrossBlocks') && files.editorSearch.includes('findTextMatches')],
  ['Editor: persistent page layout', files.editor.includes('kzdoc:layout:')],
  ['Editor: rich RTF import/export', files.editor.includes('parseRtfToHtml') && files.editor.includes('htmlToRtf') && files.editorRtf.includes("destination==='pict") && files.editorFormats.includes('pict\\\\')],
  ['Editor: PDF reading order', files.editor.includes('pdfTextItemsToHtml') && files.editorPdf.includes('sort((a,b)')],
  ['Editor: DOCX rich round-trip tests', fs.existsSync(path.join(root, 'frontend/src/components/editorDocxRoundtrip.test.ts'))],
  ['Drive: Google Docs formatting protection', files.cloudStorage.includes('não achatar tabelas') && files.cloudStorage.includes('não perder imagens incorporadas')],
  ['Drive: Google Sheets formula sync', files.cloudStorage.includes('valueRenderOption=FORMULA') && files.cloudStorage.includes('valueInputOption=USER_ENTERED') && files.sheetsFormatting.includes('parseCsv')],
  ['Drive: sync integration tests', fs.existsSync(path.join(root, 'frontend/src/services/cloudStorage.test.ts'))],
  ['Drive: Google Slides text sync', files.cloudStorage.includes('slides.googleapis.com/v1/presentations') && files.cloudStorage.includes(':batchUpdate') && files.slidesFormatting.includes('htmlToSlideParagraphs')],
  ['Drive: stable Slides object IDs', files.cloudStorage.includes('data-slide-object-id') && files.cloudStorage.includes('htmlToSlideTextBoxes')],
  ['Drive: multi-tab Sheets mapping', files.cloudStorage.includes('sheets.properties(title,index,sheetId)') && files.cloudStorage.includes('htmlToSpreadsheetTables')],
  ['Drive: Sheets multi-tab behavior tests', fs.existsSync(path.join(root, 'frontend/src/services/googleSheetsFormatting.test.ts')) && fs.existsSync(path.join(root, 'frontend/src/services/cloudStorage.test.ts'))],
  ['Editor: three-way conflict merge', files.editor.includes('mergeDocumentContent') && files.editorMerge.includes('diffHunks')],
  ['Editor: merge behavior tests', fs.existsSync(path.join(root, 'frontend/src/components/editorMerge.test.ts'))],
  ['Editor: version comparison', files.app.includes('Comparar com atual') && files.app.includes('versionPlainText')],
  ['Drive: safe Slides rich-content guard', files.slidesFormatting.includes("querySelector('table')") && files.slidesFormatting.includes("querySelector('img')") && files.slidesFormatting.includes('formatação inline')],
  ['Drive: Slides sync integration tests', fs.existsSync(path.join(root, 'frontend/src/services/googleSlidesFormatting.test.ts'))],

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
  ['iOS: current Nexus URL', files.ios.includes('https://nexus.korczaktech.com.br/')]
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
