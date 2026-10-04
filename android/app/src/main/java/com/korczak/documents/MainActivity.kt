package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var rootLayout: FrameLayout
    private lateinit var nativeEditorToolbar: HorizontalScrollView
    private lateinit var session: SessionStore
    private lateinit var api: ApiClient
    private lateinit var storage: StorageManager
    private val pool = Executors.newCachedThreadPool()
    private val treeRequest = 7001
    private val fileRequest = 7002
    private val mediaRequest = 7003
    private var pendingFileCallback: String? = null
    private var pendingMediaCallback: String? = null
    private var pendingCallback: String? = null
    private var lastHandledDocumentUri: String? = null

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        session = SessionStore(this)
        api = ApiClient(session)
        storage = StorageManager(this)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(Bridge(), "Android")
        }
        rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.TRANSPARENT)
            addView(web, FrameLayout.LayoutParams(-1, -1))
        }
        nativeEditorToolbar = buildNativeEditorToolbar()
        nativeEditorToolbar.visibility = View.GONE
        val toolbarLp = FrameLayout.LayoutParams(-1, dp(58)).apply {
            gravity = Gravity.BOTTOM
            bottomMargin = dp(78)
        }
        rootLayout.addView(nativeEditorToolbar, toolbarLp)
        setContentView(rootLayout)
        web.loadUrl("file:///android_asset/index.html")

        requestStartupPermissions()
        handleFeedbackIntent(intent)
        handleDocumentIntent(intent)
        Updater(this).resumePending()

        // A verificação automática precisa ocorrer depois que o WebView foi iniciado.
        // Fazemos uma tentativa inicial e uma segunda tentativa curta para recuperar
        // falhas transitórias de rede sem exigir que o usuário abra "Atualizações".
        web.postDelayed({ checkForUpdateIfEnabled() }, 1200)
        web.postDelayed({
            if (isFinishing || isDestroyed) return@postDelayed
            checkForUpdateIfEnabled()
        }, 9000)
    }


    private fun checkForUpdateIfEnabled() {
        val prefs = getSharedPreferences("nexus_settings", MODE_PRIVATE)
        if (!prefs.getBoolean("autoUpdate", true)) return
        Updater(this).check { result ->
            if (!result.startsWith("update|")) return@check
            val parts = result.split("|", limit = 4)
            runOnUiThread {
                NexusFeedback.alert(
                    this,
                    "Atualização disponível",
                    "Korczak Nexus " + parts.getOrElse(1) { "" } + " está disponível. Deseja instalar?",
                    NexusFeedback.Type.INFO,
                    "Instalar",
                    "Depois",
                    onPositive = {
                        Updater(this).install(parts.getOrElse(2) { "" }, parts.getOrElse(3) { "" }) { status ->
                            if (status.startsWith("failed|")) {
                                runOnUiThread {
                                    NexusFeedback.alert(
                                        this,
                                        "Falha na atualização",
                                        status.removePrefix("failed|"),
                                        NexusFeedback.Type.ERROR
                                    )
                                }
                            }
                        }
                    }
                )
            }
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt().coerceAtLeast(1)

    private fun toolbarButton(label: String, action: String, accent: Boolean = false): Button {
        return Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 12f
            setTextColor(Color.WHITE)
            minWidth = dp(if (label.length > 7) 82 else 52)
            minimumHeight = dp(46)
            setPadding(dp(10), 0, dp(10), 0)
            background = GradientDrawable().apply {
                cornerRadius = dp(11).toFloat()
                setStroke(dp(1), if (accent) Color.rgb(24, 139, 229) else Color.rgb(35, 77, 107))
                setColor(if (accent) Color.rgb(8, 93, 177) else Color.rgb(9, 31, 49))
            }
            setOnClickListener {
                if (action == "save") {
                    web.evaluateJavascript("window.saveEditor && window.saveEditor()", null)
                } else {
                    val js = when (action) {
                        "undo" -> "undo()"
                        "redo" -> "redo()"
                        "bold" -> "editorCmd('bold')"
                        "italic" -> "editorCmd('italic')"
                        "underline" -> "editorCmd('underline')"
                        "strike" -> "editorCmd('strikeThrough')"
                        "h1" -> "editorCmd('formatBlock','H1')"
                        "h2" -> "editorCmd('formatBlock','H2')"
                        "list" -> "editorCmd('insertUnorderedList')"
                        "numbers" -> "editorCmd('insertOrderedList')"
                        "left" -> "editorCmd('justifyLeft')"
                        "center" -> "editorCmd('justifyCenter')"
                        "right" -> "editorCmd('justifyRight')"
                        "justify" -> "editorCmd('justifyFull')"
                        "indent" -> "editorCmd('indent')"
                        "outdent" -> "editorCmd('outdent')"
                        "clear" -> "editorCmd('removeFormat')"
                        "link" -> "addLink()"
                        "image" -> "insertImage()"
                        "table" -> "insertTable()"
                        "check" -> "insertCheck()"
                        "quote" -> "insertQuote()"
                        "layout" -> "layoutPanel()"
                        "find" -> "findReplace()"
                        "versions" -> "versionsPanel()"
                        "stats" -> "stats()"
                        "export" -> "exportDoc()"
                        "zoomout" -> "setZoom(ES.zoom-10)"
                        "zoomin" -> "setZoom(ES.zoom+10)"
                        "focus" -> "document.body.classList.toggle('nx-focus')"
                        "reading" -> "document.body.classList.toggle('nx-reading')"
                        else -> ""
                    }
                    if (js.isNotBlank()) web.evaluateJavascript(
                        "(function(){var p=document.getElementById('page');if(p)p.focus();$js;document.dispatchEvent(new Event('input'))})()",
                        null
                    )
                }
            }
        }
    }

    private fun buildNativeEditorToolbar(): HorizontalScrollView {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(6), dp(8), dp(6))
            background = GradientDrawable().apply {
                setColor(Color.rgb(6, 19, 33))
                setStroke(dp(1), Color.rgb(25, 59, 88))
            }
        }
        val buttons = listOf(
            "↶" to "undo", "↷" to "redo", "B" to "bold", "I" to "italic", "U" to "underline",
            "S̶" to "strike", "H1" to "h1", "H2" to "h2", "Lista" to "list", "1." to "numbers",
            "Esq." to "left", "Centro" to "center", "Dir." to "right", "Just." to "justify",
            "Recuar" to "indent", "Voltar" to "outdent", "Limpar" to "clear",
            "Link" to "link", "Imagem" to "image", "Tabela" to "table", "Checklist" to "check",
            "Citação" to "quote", "Layout" to "layout", "Buscar" to "find", "Versões" to "versions",
            "Stats" to "stats", "− Zoom" to "zoomout", "+ Zoom" to "zoomin", "Foco" to "focus",
            "Leitura" to "reading", "Salvar" to "save"
        )
        buttons.forEach { (label, action) ->
            val lp = LinearLayout.LayoutParams(-2, -1).apply { marginEnd = dp(6) }
            row.addView(toolbarButton(label, action, action == "save"), lp)
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            setBackgroundColor(Color.rgb(6, 19, 33))
            addView(row, ViewGroup.LayoutParams(-2, -1))
        }
    }

    private fun setNativeEditorMode(visible: Boolean) {
        runOnUiThread {
            if (!::nativeEditorToolbar.isInitialized) return@runOnUiThread
            nativeEditorToolbar.visibility = if (visible) View.VISIBLE else View.GONE
        }
    }

    private var permissionFlowActive = false

    private fun missingStartupPermissions(): List<String> {
        val missing = mutableListOf<String>()
        if (android.os.Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()) {
            missing.add("Acesso amplo ao armazenamento")
        }
        if (android.os.Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()) {
            missing.add("Permissão para instalar atualizações do Nexus")
        }
        return missing
    }

    private fun requestStartupPermissions() {
        if (permissionFlowActive) return
        val missing = missingStartupPermissions()

        // Se tudo já estiver autorizado, não mostra aviso nenhum.
        if (missing.isEmpty()) return

        permissionFlowActive = true
        requestNextPermission(missing, 0)
    }

    private fun requestNextPermission(missing: List<String>, index: Int) {
        if (index >= missing.size) {
            permissionFlowActive = false
            return
        }

        val permission = missing[index]
        // A lista pode ter mudado enquanto a tela do Android estava aberta.
        val stillMissing = when (permission) {
            "Acesso amplo ao armazenamento" ->
                android.os.Build.VERSION.SDK_INT >= 30 && !Environment.isExternalStorageManager()
            "Permissão para instalar atualizações do Nexus" ->
                android.os.Build.VERSION.SDK_INT >= 26 && !packageManager.canRequestPackageInstalls()
            else -> false
        }

        if (!stillMissing) {
            requestNextPermission(missing, index + 1)
            return
        }

        NexusFeedback.alert(
            this,
            "Permissão necessária",
            "O Nexus precisa de: $permission. Essa autorização é usada para acessar os arquivos e manter o aplicativo atualizável.",
            NexusFeedback.Type.WARNING,
            "Autorizar",
            "Agora não",
            onPositive = {
                permissionFlowActive = false
                when (permission) {
                    "Acesso amplo ao armazenamento" -> {
                        try {
                            startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:$packageName")))
                        } catch (_: Exception) {
                            startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                        }
                    }
                    "Permissão para instalar atualizações do Nexus" ->
                        startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
                }
            },
            onNegative = { permissionFlowActive = false }
        )
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleFeedbackIntent(intent)
        handleDocumentIntent(intent)
    }

    /**
     * Recebe arquivos enviados pelo seletor "Abrir com..." / "Editar com...".
     * O Android entrega uma content:// URI com uma permissão temporária de leitura.
     */
    private fun handleDocumentIntent(intent: Intent?) {
        val action = intent?.action ?: return
        if (action != Intent.ACTION_VIEW && action != Intent.ACTION_EDIT) return
        val uri = intent.data ?: return
        if (lastHandledDocumentUri == uri.toString()) return
        lastHandledDocumentUri = uri.toString()

        try {
            val document = DocumentFile.fromSingleUri(this, uri)
            val name = document?.name ?: "Documento"
            val flags = intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            if (flags != 0) {
                try {
                    contentResolver.takePersistableUriPermission(uri, flags)
                } catch (_: Exception) {
                    // Nem todo provider oferece permissão persistente; a permissão temporária continua válida.
                }
            }

            web.postDelayed({
                val js = "window.openExisting && window.openExisting(" +
                    JSONObject.quote(uri.toString()) + "," +
                    JSONObject.quote(name) +
                    ")"
                web.evaluateJavascript(js, null)
            }, 900)
        } catch (e: Exception) {
            NexusFeedback.snackbar(this, e.message ?: "Não foi possível abrir o documento.", NexusFeedback.Type.ERROR)
        }
    }

    private fun handleFeedbackIntent(intent: Intent?) {
        val type = intent?.getStringExtra("nexus_feedback_type") ?: return
        val message = intent.getStringExtra("nexus_feedback_message") ?: return
        val title = intent.getStringExtra("nexus_feedback_title") ?: "Nexus"
        when (type) {
            "success" -> NexusFeedback.toast(this, message, NexusFeedback.Type.SUCCESS)
            "error" -> NexusFeedback.alert(this, title, message, NexusFeedback.Type.ERROR)
            "warning" -> NexusFeedback.snackbar(this, message, NexusFeedback.Type.WARNING)
            else -> NexusFeedback.toast(this, message, NexusFeedback.Type.INFO)
        }
        intent.removeExtra("nexus_feedback_type")
        intent.removeExtra("nexus_feedback_message")
        intent.removeExtra("nexus_feedback_title")
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::web.isInitialized) {
            web.evaluateJavascript("(window.handleBack && window.handleBack())", null)
        } else {
            super.onBackPressed()
        }
    }

    override fun onResume() {
        super.onResume()
        if (!permissionFlowActive) requestStartupPermissions()
        handleDocumentIntent(intent)
        Updater(this).resumePending()
        if (::web.isInitialized) {
            web.postDelayed({ checkForUpdateIfEnabled() }, 1500)
        }
        if (::web.isInitialized) {
            web.postDelayed({
                web.evaluateJavascript("window.__nativeStorageRefresh && window.__nativeStorageRefresh()", null)
            }, 350)
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun call(action: String, payload: String, callback: String) {
            pool.execute {
                try {
                    val p = JSONObject(payload)
                    when (action) {
                        "editorMode" -> {
                            setNativeEditorMode(p.optBoolean("visible", false))
                            respond(callback, JSONObject().put("ok", true))
                        }

                        "session" -> {
                            val result =
                                if (session.token != null && session.userJson != null)
                                    JSONObject().put("ok", true).put("user", JSONObject(session.userJson!!))
                                else JSONObject().put("ok", false)
                            respond(callback, result)
                        }

                        "validateSession" -> {
                            if (session.token == null) {
                                respond(callback, JSONObject().put("ok", false).put("error", "Sessão ausente"))
                            } else {
                                val response = api.me()
                                if (response.code in 200..299) {
                                    try {
                                        val user = JSONObject(response.body)
                                        session.userJson = user.toString()
                                        respond(callback, JSONObject().put("ok", true).put("user", user))
                                    } catch (_: Exception) {
                                        respond(callback, JSONObject().put("ok", false).put("error", "Resposta de sessão inválida"))
                                    }
                                } else {
                                    if (response.code == 401) session.clear()
                                    respond(callback, JSONObject().put("ok", false).put("status", response.code).put("error", api.errorMessage(response)))
                                }
                            }
                        }

                        "appInfo" -> {
                            val info = packageManager.getPackageInfo(packageName, 0)
                            respond(
                                callback,
                                JSONObject()
                                    .put("ok", true)
                                    .put("versionName", info.versionName ?: "—")
                                    .put("versionCode", if (android.os.Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode)
                            )
                        }

                        "api" -> {
                            val response = api.request(
                                p.optString("method", "GET"),
                                p.optString("path"),
                                p.optString("body").takeIf { it.isNotEmpty() }
                            )
                            if (response.code in 200..299 &&
                                (p.optString("path") == "/api/v1/auth/login" ||
                                 p.optString("path") == "/api/v1/auth/register")
                            ) api.saveSession(response)

                            val data: Any = when {
                                response.body.isBlank() -> JSONObject()
                                response.body.trimStart().startsWith("{") -> JSONObject(response.body)
                                response.body.trimStart().startsWith("[") -> JSONArray(response.body)
                                else -> response.body
                            }

                            respond(
                                callback,
                                JSONObject()
                                    .put("ok", response.code in 200..299)
                                    .put("status", response.code)
                                    .put("data", data)
                                    .put("error", if (response.code in 200..299) "" else api.errorMessage(response))
                            )
                        }

                        "logout" -> {
                            api.logout()
                            session.clear()
                            respond(callback, JSONObject().put("ok", true))
                        }

                        "confirmExit" -> runOnUiThread {
                            NexusFeedback.alert(
                                this@MainActivity,
                                "Sair do Nexus",
                                "Deseja fechar o aplicativo agora?",
                                NexusFeedback.Type.WARNING,
                                "Sair",
                                "Cancelar",
                                onPositive = {
                                    finishAndRemoveTask()
                                }
                            )
                            respondJs(callback, JSONObject().put("ok", true))
                        }

                        "exitApp" -> runOnUiThread {
                            finishAndRemoveTask()
                            respondJs(callback, JSONObject().put("ok", true))
                        }

                        "setSetting" -> {
                            val key = p.optString("key")
                            val value = p.optBoolean("value")
                            getSharedPreferences("nexus_settings", MODE_PRIVATE).edit().putBoolean(key, value).apply()
                            respond(callback, JSONObject().put("ok", true))
                        }

                        "storageInfo", "listFiles" -> {
                            val result = storage.deviceStorage().put("files", storage.listFiles())
                            respond(callback, JSONObject().put("ok", true).put("label", storage.label()).put("files", storage.listFiles()).put("total", result.optLong("total")).put("available", result.optLong("available")).put("used", result.optLong("used")).put("allFiles", result.optBoolean("allFiles")).put("documentStats", result.optJSONObject("documentStats") ?: JSONObject()))
                        }

                        "requestStorage" -> runOnUiThread {
                            // A opção "Acesso amplo" abre a tela oficial do Android.
                            // O SAF continua disponível em "pickStorage" para acesso por pasta.
                            if (android.os.Build.VERSION.SDK_INT >= 30) {
                                try {
                                    startActivity(
                                        Intent(
                                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                            Uri.parse("package:$packageName")
                                        )
                                    )
                                    respond(callback, JSONObject().put("ok", true).put("message", "Abra a opção de acesso a todos os arquivos e retorne ao Nexus."))
                                } catch (_: Exception) {
                                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                                    respond(callback, JSONObject().put("ok", true).put("message", "Abra a opção de acesso a todos os arquivos e retorne ao Nexus."))
                                }
                            } else {
                                respond(callback, JSONObject().put("ok", true).put("message", "Esta versão do Android não usa a tela de acesso amplo."))
                            }
                        }

                        "readFile" -> {
                            try {
                                val content = storage.read(p.getString("uri"))
                                respond(callback, JSONObject().put("ok", true).put("content", content))
                            } catch (error: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", error.message ?: "Não foi possível ler este arquivo."))
                            }
                        }

                        "rootFolder" -> {
                            val root = storage.savedTree()
                            respond(
                                callback,
                                JSONObject()
                                    .put("ok", root != null)
                                    .put("uri", root?.toString() ?: "")
                                    .put("name", storage.label())
                                    .put("error", if (root != null) "" else "Escolha um armazenamento antes de salvar")
                            )
                        }

                        "listFolders" -> {
                            respond(
                                callback,
                                JSONObject().put("ok", true).put(
                                    "folders",
                                    storage.listFolders(p.optString("uri").takeIf { it.isNotBlank() })
                                )
                            )
                        }

                        "writeFile" -> {
                            val folderUri = p.optString("folderUri")
                            val result = if (folderUri.isNotBlank()) {
                                storage.saveInFolder(
                                    folderUri,
                                    p.optString("name", "Novo documento.kz-nexus"),
                                    p.optString("content")
                                )
                            } else {
                                storage.write(
                                    p.optString("uri"),
                                    p.optString("name", "Novo documento.kz-nexus"),
                                    p.optString("content")
                                )
                            }
                            respond(
                                callback,
                                JSONObject()
                                    .put("ok", result.first)
                                    .put("uri", result.second ?: "")
                                    .put("error", if (result.first) "" else "Não foi possível salvar nesta pasta")
                            )
                        }

                        "createFolder" -> {
                            val ok = storage.createFolder(p.optString("name", "Nova pasta"))
                            respond(
                                callback,
                                JSONObject().put("ok", ok).put("error", if (ok) "" else "Selecione um armazenamento")
                            )
                        }

                        "renameFile" -> {
                            val ok = storage.rename(p.optString("uri"), p.optString("name", "Arquivo"))
                            respond(callback, JSONObject().put("ok", ok).put("error", if (ok) "" else "Não foi possível renomear o arquivo"))
                        }

                        "deleteFile" -> {
                            val ok = storage.delete(p.optString("uri"))
                            respond(callback, JSONObject().put("ok", ok).put("error", if (ok) "" else "Não foi possível excluir o arquivo"))
                        }

                        "fileInfo" -> {
                            try { respond(callback, JSONObject().put("ok", true).put("info", storage.fileInfo(p.optString("uri")))) }
                            catch (e: Exception) { respond(callback, JSONObject().put("ok", false).put("error", e.message ?: "Não foi possível obter informações")) }
                        }

                        "copyFile" -> {
                            val result = storage.copy(p.optString("uri"), p.optString("folderUri"), p.optString("name"))
                            respond(callback, JSONObject().put("ok", result.first).put("uri", result.second ?: "").put("error", if (result.first) "" else "Não foi possível copiar o arquivo"))
                        }

                        "zipFiles" -> {
                            val result = storage.zipFiles(p.optJSONArray("uris") ?: JSONArray(), p.optString("folderUri"), p.optString("name", "Nexus-Arquivo"))
                            respond(callback, JSONObject().put("ok", result.first).put("uri", result.second ?: "").put("error", if (result.first) "" else "Não foi possível criar o ZIP"))
                        }

                        "shareText" -> runOnUiThread {
                            val text = p.optString("text")
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = p.optString("mime", "text/plain")
                                putExtra(Intent.EXTRA_TEXT, text)
                            }
                            try {
                                startActivity(Intent.createChooser(send, p.optString("title", "Compartilhar pelo Nexus")))
                                respond(callback, JSONObject().put("ok", true))
                            } catch (e: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", e.message ?: "Nenhum aplicativo de compartilhamento disponível"))
                            }
                        }

                        "copyText" -> {
                            val clipboard = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                            clipboard.setPrimaryClip(android.content.ClipData.newPlainText("Nexus", p.optString("text")))
                            respond(callback, JSONObject().put("ok", true))
                        }

                        "openLocation" -> runOnUiThread {
                            try {
                                val uri = Uri.parse(p.optString("uri"))
                                val intent = Intent(Intent.ACTION_VIEW).apply {
                                    data = uri
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                }
                                startActivity(intent)
                                respond(callback, JSONObject().put("ok", true))
                            } catch (e: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", e.message ?: "Não foi possível abrir o local"))
                            }
                        }

                        "openFile" -> runOnUiThread {
                            try {
                                val uri = Uri.parse(p.getString("uri"))
                                val document = DocumentFile.fromSingleUri(this@MainActivity, uri)
                                val mime = document?.type?.takeIf { it.isNotBlank() } ?: "*/*"
                                val intent = Intent(Intent.ACTION_VIEW).apply {
                                    setDataAndType(uri, mime)
                                    addCategory(Intent.CATEGORY_DEFAULT)
                                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                    clipData = android.content.ClipData.newRawUri("Nexus", uri)
                                }
                                startActivity(intent)
                                respond(callback, JSONObject().put("ok", true))
                            } catch (error: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", error.message ?: "Nenhum aplicativo compatível pode abrir este arquivo."))
                            }
                        }

                        "clipboardSet" -> {
                            val text = p.optString("text")
                            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("Korczak Nexus", text))
                            respond(callback, JSONObject().put("ok", true))
                        }

                        "clipboardGet" -> {
                            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            val text = if (clipboard.hasPrimaryClip()) clipboard.primaryClip?.getItemAt(0)?.coerceToText(this@MainActivity)?.toString() ?: "" else ""
                            respond(callback, JSONObject().put("ok", true).put("text", text))
                        }

                        "printEditor" -> runOnUiThread {
                            try {
                                val printManager = getSystemService(Context.PRINT_SERVICE) as PrintManager
                                val adapter = web.createPrintDocumentAdapter("Korczak Nexus - " + (p.optString("name").ifBlank { "Documento" }))
                                printManager.print(
                                    "Korczak Nexus",
                                    adapter,
                                    PrintAttributes.Builder()
                                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                        .build()
                                )
                                respond(callback, JSONObject().put("ok", true))
                            } catch (error: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", error.message ?: "Não foi possível abrir a impressão"))
                            }
                        }

                        "pickFile" -> runOnUiThread {
                            pendingFileCallback = callback
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                                .setType("*/*")
                                .addCategory(Intent.CATEGORY_OPENABLE)
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            startActivityForResult(intent, fileRequest)
                        }

                        "pickMedia" -> runOnUiThread {
                            pendingMediaCallback = callback
                            val mime = p.optString("mime", "*/*").ifBlank { "*/*" }
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
                                .setType(mime)
                                .addCategory(Intent.CATEGORY_OPENABLE)
                                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            startActivityForResult(intent, mediaRequest)
                        }

                        "pickStorage" -> runOnUiThread {
                            pendingCallback = callback
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                                .addFlags(
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                                )
                            startActivityForResult(intent, treeRequest)
                        }

                        "installUpdate" -> {
                            val url = p.optString("url")
                            val digest = p.optString("digest")
                            if (url.isBlank()) {
                                respond(callback, JSONObject().put("ok", false).put("error", "URL da atualização não encontrada"))
                            } else {
                                Updater(this@MainActivity).install(url, digest) { result ->
                                    val response = when {
                                        result == "permission_install" -> JSONObject().put("ok", true).put("permission", true)
                                        result == "installer" -> JSONObject().put("ok", true).put("message", "Instalação entregue ao Android")
                                        result.startsWith("failed|") -> JSONObject().put("ok", false).put("error", result.removePrefix("failed|"))
                                        else -> JSONObject().put("ok", false).put("error", "Não foi possível iniciar a atualização")
                                    }
                                    respond(callback, response)
                                }
                            }
                        }

                        "checkUpdate" -> Updater(this@MainActivity).check { result ->
                            when {
                                result.startsWith("update|") -> {
                                    val parts = result.split("|", limit = 4)
                                    respond(
                                        callback,
                                        JSONObject()
                                            .put("ok", true)
                                            .put("updateAvailable", true)
                                            .put("version", parts.getOrElse(1) { "" })
                                            .put("url", parts.getOrElse(2) { "" })
                                            .put("digest", parts.getOrElse(3) { "" })
                                            .put("message", "Atualização disponível: " + parts.getOrElse(1) { "" })
                                    )
                                }
                                result == "up_to_date" -> respond(
                                    callback,
                                    JSONObject().put("ok", true).put("updateAvailable", false).put("message", "O aplicativo já está atualizado.")
                                )
                                result.startsWith("failed|") -> respond(
                                    callback,
                                    JSONObject().put("ok", false).put("updateAvailable", false).put("error", result.removePrefix("failed|"))
                                )
                                else -> respond(callback, JSONObject().put("ok", false).put("error", "Não foi possível concluir a verificação."))
                            }
                        }

                        else -> respond(callback, JSONObject().put("ok", false).put("error", "Ação não suportada"))
                    }
                } catch (error: Exception) {
                    respond(callback, JSONObject().put("ok", false).put("error", error.message ?: "Erro interno"))
                }
            }
        }

        private fun respond(id: String, result: JSONObject) {
            runOnUiThread {
                web.evaluateJavascript(
                    "window.__nativeResult(" +
                        JSONObject.quote(id) + "," +
                        JSONObject.quote(result.toString()) +
                        ")",
                    null
                )
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == mediaRequest) {
            val callback = pendingMediaCallback
            pendingMediaCallback = null
            if (resultCode == Activity.RESULT_OK && data?.data != null) {
                val uri = data.data!!
                try {
                    contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
                } catch (_: Exception) {}
                callback?.let {
                    respondJs(
                        it,
                        JSONObject()
                            .put("ok", true)
                            .put("uri", uri.toString())
                            .put("mime", contentResolver.getType(uri) ?: "*/*")
                    )
                }
            } else {
                callback?.let { respondJs(it, JSONObject().put("ok", false).put("error", "Seleção cancelada")) }
            }
            return
        }

        if (requestCode == fileRequest) {
            val callback = pendingFileCallback
            pendingFileCallback = null
            if (resultCode == Activity.RESULT_OK && data?.data != null) {
                val ok = storage.importFile(data.data!!)
                callback?.let {
                    respondJs(
                        it,
                        JSONObject().put("ok", ok).put(
                            "error",
                            if (ok) "" else "Não foi possível importar o arquivo"
                        )
                    )
                }
            } else {
                callback?.let { respondJs(it, JSONObject().put("ok", false).put("error", "Seleção cancelada")) }
            }
            return
        }

        if (requestCode != treeRequest) return

        val callback = pendingCallback
        pendingCallback = null
        if (resultCode == Activity.RESULT_OK && data?.data != null) {
            val persisted = storage.rememberTree(data.data!!)
            callback?.let {
                respondJs(
                    it,
                    if (persisted) {
                        JSONObject().put("ok", true).put("label", storage.label())
                    } else {
                        JSONObject().put("ok", false).put("error", "O Android não permitiu manter acesso a esta pasta. Escolha a pasta novamente.")
                    }
                )
            }
        } else {
            callback?.let { respondJs(it, JSONObject().put("ok", false).put("error", "Seleção cancelada")) }
        }
    }

    private fun respondJs(id: String, result: JSONObject) {
        web.evaluateJavascript(
            "window.__nativeResult(" +
                JSONObject.quote(id) + "," +
                JSONObject.quote(result.toString()) +
                ")",
            null
        )
    }

    override fun onDestroy() {
        pool.shutdownNow()
        web.removeJavascriptInterface("Android")
        super.onDestroy()
    }
}
