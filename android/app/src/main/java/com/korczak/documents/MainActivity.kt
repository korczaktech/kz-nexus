package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.print.PrintAttributes
import android.print.PrintManager
import android.net.Uri
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
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
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
    private var nativeSplash: View? = null
    private var updateCheckInFlight = false
    private var lastPromptedUpdateVersion: String? = null
    private val offline by lazy { OfflineStore(this) }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.statusBarColor = Color.rgb(3, 9, 20)
        window.navigationBarColor = Color.rgb(3, 9, 20)
        window.setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
        session = SessionStore(this)
        api = ApiClient(session)
        storage = StorageManager(this)

        web = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = true
            settings.allowContentAccess = true
            settings.allowFileAccessFromFileURLs = false
            settings.allowUniversalAccessFromFileURLs = false
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            if (android.os.Build.VERSION.SDK_INT >= 26) settings.safeBrowsingEnabled = true
            webViewClient = object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    syncSystemInsets()
                    publishNetworkState()
                    view?.postDelayed({ hideNativeSplash() }, 420)
                }
            }
            webChromeClient = WebChromeClient()
            addJavascriptInterface(Bridge(), "Android")
        }
        rootLayout = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(3, 9, 20))
            addView(web, FrameLayout.LayoutParams(-1, -1))
        }
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            web.setPadding(0, bars.top, 0, bars.bottom)
            nativeSplash?.setPadding(0, bars.top, 0, bars.bottom)
            syncSystemInsets()
            insets
        }
        nativeEditorToolbar = buildNativeEditorToolbar()
        nativeEditorToolbar.visibility = View.GONE
        val toolbarLp = FrameLayout.LayoutParams(-1, dp(58)).apply {
            gravity = Gravity.BOTTOM
            bottomMargin = dp(78)
        }
        rootLayout.addView(nativeEditorToolbar, toolbarLp)
        setContentView(rootLayout)
        showNativeSplash()
        if (state != null) {
            web.restoreState(state)
        } else {
            val html = assets.open("index.html").bufferedReader(Charsets.UTF_8).use { it.readText() }
            web.loadDataWithBaseURL(
                "file:///android_asset/",
                html,
                "text/html",
                "UTF-8",
                null
            )
        }

        // Storage Access Framework is requested on demand; no broad permission is required at startup.
        handleFeedbackIntent(intent)
        handleDocumentIntent(intent)
        handleShareIntent(intent)
        Updater(this).resumePending()
        offline.prune()

        // A verificação automática precisa ocorrer depois que o WebView foi iniciado.
        // Fazemos uma tentativa inicial e uma segunda tentativa curta para recuperar
        // falhas transitórias de rede sem exigir que o usuário abra "Atualizações".
        web.postDelayed({ checkForUpdateIfEnabled() }, 1600)
        web.postDelayed({ hideNativeSplash() }, 6000)
    }


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