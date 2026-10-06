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
import android.webkit.JavascriptInterface
import android.webkit.ConsoleMessage
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
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.webkit.WebViewAssetLoader
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
    private var nativeSplash: View? = null
    private var updateCheckInFlight = false
    private var lastPromptedUpdateVersion: String? = null
    private var rendererRecoveryAttempts = 0
    private var startupFailed = false
    private val offline by lazy { OfflineStore(this) }
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        try {
            initializeActivity(state)
        } catch (error: Throwable) {
            android.util.Log.e("KorczakNexus", "Falha fatal durante a inicialização da Activity", error)
            showStartupFailure(error)
        }
    }

    private fun initializeActivity(state: Bundle?) {
        window.statusBarColor = Color.rgb(3, 9, 20)
        window.navigationBarColor = Color.rgb(3, 9, 20)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        session = SessionStore(this)
        api = ApiClient(session)
        storage = StorageManager(this)

        rootLayout = FrameLayout(this).apply { setBackgroundColor(Color.rgb(3, 9, 20)) }
        nativeEditorToolbar = buildNativeEditorToolbar()
        nativeEditorToolbar.visibility = View.GONE
        val toolbarLp = FrameLayout.LayoutParams(-1, dp(58)).apply {
            gravity = Gravity.BOTTOM
            bottomMargin = dp(78)
        }
        rootLayout.addView(nativeEditorToolbar, toolbarLp)
        web = createConfiguredWebView()
        rootLayout.addView(web, 0, FrameLayout.LayoutParams(-1, -1))
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            if (::web.isInitialized) web.setPadding(0, bars.top, 0, bars.bottom)
            nativeSplash?.setPadding(0, bars.top, 0, bars.bottom)
            syncSystemInsets()
            insets
        }
        setContentView(rootLayout)
        showNativeSplash()
        logWebViewProvider()
        loadNexusAsset()
        runCatching { handleFeedbackIntent(intent) }
        runCatching { handleDocumentIntent(intent) }
        runCatching { handleShareIntent(intent) }
        runCatching { offline.prune() }
        mainHandler.postDelayed({ checkForUpdateIfEnabled() }, 3500)
        mainHandler.postDelayed({ hideNativeSplash() }, 10000)
    }

    private fun createConfiguredWebView(): WebView {
        return WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = true
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            settings.loadsImagesAutomatically = true
            settings.mediaPlaybackRequiresUserGesture = true
            if (android.os.Build.VERSION.SDK_INT >= 26) settings.safeBrowsingEnabled = true
            runCatching {
                if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                    WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(view: WebView, request: android.webkit.WebResourceRequest): android.webkit.WebResourceResponse? =
                    assetLoader.shouldInterceptRequest(request.url)

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    super.onPageStarted(view, url, favicon)
                    android.util.Log.i("KorczakNexus", "Nexus iniciou carregamento: " + url)
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    rendererRecoveryAttempts = 0
                    syncSystemInsets()
                    publishNetworkState()
                    view?.postDelayed({ hideNativeSplash() }, 420)
                }

                override fun onReceivedError(view: WebView, request: android.webkit.WebResourceRequest, error: android.webkit.WebResourceError) {
                    super.onReceivedError(view, request, error)
                    if (request.isForMainFrame) {
                        android.util.Log.e("KorczakNexus", "Falha ao carregar Nexus: " + error.errorCode + " " + error.description)
                        showStartupFailureIfNeeded("O Nexus não conseguiu carregar sua interface. Código " + error.errorCode + ".")
                    }
                }

                override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
                    android.util.Log.e("KorczakNexus", "WebView renderer encerrado; didCrash=" + detail.didCrash() + ", prioridade=" + detail.rendererPriorityAtExit())
                    if (isFinishing || isDestroyed) return true
                    runOnUiThread {
                        rendererRecoveryAttempts++
                        if (rendererRecoveryAttempts > 2) {
                            showStartupFailure("O componente WebView do Android encerrou repetidamente. Atualize o Android System WebView/Chrome e tente novamente.")
                        } else {
                            recreateWebView()
                        }
                    }
                    return true
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    android.util.Log.d("KorczakNexusJS", message.messageLevel().name + ": " + message.message() + " @" + message.sourceId() + ":" + message.lineNumber())
                    return true
                }
            }
            addJavascriptInterface(Bridge(), "Android")
        }
    }

    private fun recreateWebView() {
        if (isFinishing || isDestroyed) return
        val old = if (::web.isInitialized) web else null
        runCatching {
            old?.let {
                rootLayout.removeView(it)
                it.removeJavascriptInterface("Android")
                it.stopLoading()
                it.destroy()
            }
        }
        web = createConfiguredWebView()
        rootLayout.addView(web, 0, FrameLayout.LayoutParams(-1, -1))
        logWebViewProvider()
        loadNexusAsset()
    }

    private fun showStartupFailureIfNeeded(message: String) {
        if (nativeSplash != null && !startupFailed) showStartupFailure(message)
    }

    private fun showStartupFailure(error: Throwable) {
        showStartupFailure(error.message ?: error.javaClass.simpleName)
    }

    private fun showStartupFailure(message: String) {
        if (startupFailed) return
        startupFailed = true
        mainHandler.removeCallbacksAndMessages(null)
        val view = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(24), dp(28), dp(24))
            setBackgroundColor(Color.rgb(3, 9, 20))
        }
        view.addView(TextView(this).apply {
            text = "Não foi possível iniciar o Nexus"
            textSize = 20f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
        })
        view.addView(TextView(this).apply {
            text = "O aplicativo encontrou um erro durante a inicialização. Nenhum dado foi apagado.\n\n" + message.take(500)
            textSize = 13f
            gravity = Gravity.CENTER
            setTextColor(Color.LTGRAY)
            setPadding(0, dp(14), 0, dp(18))
        })
        view.addView(Button(this).apply {
            text = "Tentar novamente"
            setOnClickListener { recreate() }
        }, LinearLayout.LayoutParams(-2, -2))
        if (::rootLayout.isInitialized) {
            rootLayout.removeAllViews()
            rootLayout.addView(view, FrameLayout.LayoutParams(-1, -1))
        } else {
            setContentView(view)
        }
    }

    private fun logWebViewProvider() {
        try {
            WebViewCompat.getCurrentWebViewPackage(this)?.let { pkg ->
                android.util.Log.i("KorczakNexus", "WebView provider: ${pkg.packageName} ${pkg.versionName}")
            }
        } catch (error: Throwable) {
            android.util.Log.w("KorczakNexus", "Não foi possível identificar o provider do WebView", error)
        }
    }

    private fun loadNexusAsset() {
        if (!::web.isInitialized) return
        runCatching {
            web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }.onFailure {
            android.util.Log.e("KorczakNexus", "Falha ao carregar o shell local do Nexus", it)
            showStartupFailure(it)
        }
    }

    private fun createWebViewAndLoad() = recreateWebView()

    private fun checkForUpdateIfEnabled() {
        if (updateCheckInFlight || isFinishing || isDestroyed) return
        val prefs = getSharedPreferences("nexus_settings", MODE_PRIVATE)
        if (!prefs.getBoolean("autoUpdate", true)) return
        updateCheckInFlight = true
        Updater(this).check { result ->
            updateCheckInFlight = false
            if (!result.startsWith("update|")) return@check
            val parts = result.split("|", limit = 4)
            if (parts.getOrElse(1) { "" } == lastPromptedUpdateVersion) return@check
            lastPromptedUpdateVersion = parts.getOrElse(1) { "" }
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

    // Android storage permissions are requested only when a feature explicitly needs them.

    private fun showNativeSplash() {
        if (nativeSplash != null) return
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(24), 0, dp(24), 0)
            setBackgroundColor(Color.rgb(3, 9, 20))
        }
        val icon = ImageView(this).apply {
            setImageDrawable(ContextCompat.getDrawable(this@MainActivity, R.drawable.ic_kz))
            scaleType = ImageView.ScaleType.CENTER_INSIDE
        }
        root.addView(icon, LinearLayout.LayoutParams(dp(108), dp(108)))
        root.addView(TextView(this).apply {
            text = "KORCZAK NEXUS"
            textSize = 17f
            gravity = Gravity.CENTER
            setTextColor(Color.WHITE)
            letterSpacing = 0.16f
            setPadding(0, dp(14), 0, 0)
        }, LinearLayout.LayoutParams(-1, -2))
        root.addView(TextView(this).apply {
            text = "DOCUMENTS"
            textSize = 10f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(83, 200, 255))
            letterSpacing = 0.38f
            setPadding(0, dp(4), 0, 0)
        }, LinearLayout.LayoutParams(-1, -2))
        nativeSplash = root
        rootLayout.addView(root, FrameLayout.LayoutParams(-1, -1))
    }

    private fun hideNativeSplash() {
        val splash = nativeSplash ?: return
        nativeSplash = null
        splash.animate().alpha(0f).setDuration(180).withEndAction {
            rootLayout.removeView(splash)
        }.start()
    }

    private fun syncSystemInsets() {
        if (!::web.isInitialized) return
        val top = web.paddingTop
        val bottom = web.paddingBottom
        val js = "(function(){document.documentElement.style.setProperty('--nx-native-top-inset','" +
            top + "px');document.documentElement.style.setProperty('--nx-native-bottom-inset','" +
            bottom + "px');})();"
        web.evaluateJavascript(js, null)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleFeedbackIntent(intent)
        handleDocumentIntent(intent)
        handleShareIntent(intent)
    }

    private fun handleShareIntent(intent: Intent?) {
        if (intent?.action != Intent.ACTION_SEND) return
        val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        val text = intent.getStringExtra(Intent.EXTRA_TEXT)
        if (uri != null) {
            try { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (_: Exception) {}
            web.postDelayed({
                val name = DocumentFile.fromSingleUri(this, uri)?.name ?: "Arquivo compartilhado"
                val js = "window.openExisting && window.openExisting(" + JSONObject.quote(uri.toString()) + "," + JSONObject.quote(name) + ")"
                web.evaluateJavascript(js, null)
            }, 650)
        }
        if (!text.isNullOrBlank()) {
            web.postDelayed({
                web.evaluateJavascript("(window.openCreateFromText&&window.openCreateFromText(" + JSONObject.quote(text) + "))", null)
            }, 750)
        }
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

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        // Não limpar histórico, matches ou memória do WebView manualmente.
        // O editor pode estar mantendo DOM, seleção e conteúdo em edição; destruir
        // essas estruturas sob pressão de memória causa perdas de estado e instabilidade.
        if (::web.isInitialized && !isFinishing && !isDestroyed) {
            web.evaluateJavascript(
                "(function(){if(window.dispatchEvent)window.dispatchEvent(new Event('nexusMemoryPressure'))})()",
                null
            )
        }
    }

    private fun publishNetworkState() {
        if (!::web.isInitialized) return
        val state = offline.networkState()
        web.evaluateJavascript("(function(){window.dispatchEvent(new CustomEvent('nexusNetworkState',{detail:" + JSONObject.quote(state.toString()) + "}));})()", null)
    }

    override fun onResume() {
        super.onResume()
        handleDocumentIntent(intent)
        handleShareIntent(intent)
        if (::web.isInitialized) {
            web.postDelayed({ checkForUpdateIfEnabled() }, 1500)
        }
        if (::web.isInitialized) {
            web.postDelayed({ publishNetworkState() }, 250)
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
                        "networkState" -> respond(callback, offline.networkState())
                        "offlineQueue" -> respond(callback, offline.queueSnapshot())
                        "queueWrite" -> {
                            val id = offline.enqueue(p.optString("uri"), p.optString("name"), p.optString("content"))
                            respond(callback, JSONObject().put("ok", true).put("id", id))
                        }
                        "removeQueuedWrite" -> {
                            offline.remove(p.optString("id"))
                            respond(callback, JSONObject().put("ok", true))
                        }

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
                            pendingCallback = callback
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
                                .addFlags(
                                    Intent.FLAG_GRANT_READ_URI_PERMISSION or
                                    Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                                )
                            startActivityForResult(intent, treeRequest)
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
                            val name = p.optString("name", "Novo documento.kz-nexus")
                            val content = p.optString("content")
                            val result = if (folderUri.isNotBlank()) {
                                storage.saveInFolder(folderUri, name, content)
                            } else {
                                storage.write(p.optString("uri"), name, content)
                            }
                            if (!result.first && !offline.networkState().optBoolean("online")) {
                                val id = offline.enqueue(p.optString("uri"), name, content)
                                respond(callback, JSONObject().put("ok", true).put("queued", true).put("queueId", id).put("uri", result.second ?: "").put("error", "Sem conexão. Alteração preservada localmente."))
                            } else {
                                respond(callback, JSONObject().put("ok", result.first).put("uri", result.second ?: "").put("error", if (result.first) "" else "Não foi possível salvar nesta pasta"))
                            }
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

                        "trashFile" -> {
                            respond(callback, storage.trash(p.optString("uri")))
                        }

                        "listTrash" -> {
                            respond(callback, JSONObject().put("ok", true).put("files", storage.listTrash()))
                        }

                        "restoreTrash" -> {
                            respond(callback, storage.restoreTrash(p.optString("uri")))
                        }

                        "permanentDeleteTrash" -> {
                            val ok = storage.permanentDeleteTrash(p.optString("uri"))
                            respond(callback, JSONObject().put("ok", ok).put("error", if (ok) "" else "Não foi possível excluir definitivamente"))
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
                                val paper = when (p.optString("paper", "A4").uppercase()) {
                                    "A3" -> PrintAttributes.MediaSize.ISO_A3
                                    "A5" -> PrintAttributes.MediaSize.ISO_A5
                                    "LETTER" -> PrintAttributes.MediaSize.NA_LETTER
                                    "LEGAL" -> PrintAttributes.MediaSize.NA_LEGAL
                                    else -> PrintAttributes.MediaSize.ISO_A4
                                }
                                val landscape = p.optString("orientation", "portrait").equals("landscape", ignoreCase = true)
                                val builder = PrintAttributes.Builder()
                                    .setMediaSize(if (landscape) paper.asLandscape() else paper)
                                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                                if (android.os.Build.VERSION.SDK_INT >= 23) {
                                    builder.setColorMode(
                                        if (p.optBoolean("color", true)) PrintAttributes.COLOR_MODE_COLOR else PrintAttributes.COLOR_MODE_MONOCHROME
                                    )
                                    if (p.optBoolean("duplex", false)) {
                                        builder.setDuplexMode(PrintAttributes.DUPLEX_MODE_LONG_EDGE)
                                    }
                                }
                                printManager.print("Korczak Nexus", adapter, builder.build())
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
                if (!::web.isInitialized || isFinishing || isDestroyed) return@runOnUiThread
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
        if (!::web.isInitialized || isFinishing || isDestroyed) return
        web.evaluateJavascript(
            "window.__nativeResult(" +
                JSONObject.quote(id) + "," +
                JSONObject.quote(result.toString()) +
                ")",
            null
        )
    }

    override fun onDestroy() {
        // Cancela callbacks agendados no WebView antes de destruí-lo.
        if (::web.isInitialized) {
            web.removeJavascriptInterface("Android")
            web.stopLoading()
            web.destroy()
        }
        pool.shutdownNow()
        super.onDestroy()
    }
}
