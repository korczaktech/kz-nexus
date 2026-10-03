package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    private lateinit var session: SessionStore
    private lateinit var api: ApiClient
    private lateinit var storage: StorageManager
    private val pool = Executors.newCachedThreadPool()
    private val treeRequest = 7001
    private var pendingCallback: String? = null

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
            webViewClient = WebViewClient()
            webChromeClient = WebChromeClient()
            addJavascriptInterface(Bridge(), "Android")
        }
        setContentView(web)
        web.loadUrl("file:///android_asset/index.html")
        Updater(this).check { result ->
            if (result.startsWith("update|")) {
                val parts = result.split("|", limit = 4)
                runOnUiThread {
                    AlertDialog.Builder(this)
                        .setTitle("Atualização disponível")
                        .setMessage("KZ Documents " + parts.getOrElse(1) { "" } + " está disponível. Deseja instalar?")
                        .setNegativeButton("Depois", null)
                        .setPositiveButton("Instalar") { _, _ ->
                            Updater(this).install(parts.getOrElse(2) { "" }, parts.getOrElse(3) { "" }) {}
                        }.show()
                }
            }
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun call(action: String, payload: String, callback: String) {
            pool.execute {
                try {
                    val p = JSONObject(payload)
                    when (action) {
                        "session" -> {
                            val result = if (session.token != null && session.userJson != null)
                                JSONObject().put("ok", true).put("user", JSONObject(session.userJson!!))
                            else JSONObject().put("ok", false)
                            respond(callback, result)
                        }
                        "api" -> {
                            val response = api.request(p.optString("method", "GET"), p.optString("path"), p.optString("body").takeIf { it.isNotEmpty() })
                            if (response.code in 200..299 && (p.optString("path") == "/api/v1/auth/login" || p.optString("path") == "/api/v1/auth/register")) api.saveSession(response)
                            val data: Any = if (response.body.isBlank()) JSONObject() else try { JSONObject(response.body) } catch (_: Exception) { JSONArray(response.body) }
                            respond(callback, JSONObject().put("ok", response.code in 200..299).put("status", response.code).put("data", data).put("error", if (response.code in 200..299) "" else api.errorMessage(response)))
                        }
                        "logout" -> { api.logout(); session.clear(); respond(callback, JSONObject().put("ok", true)) }
                        "storageInfo", "listFiles" -> respond(callback, JSONObject().put("ok", true).put("label", storage.label()).put("files", storage.listFiles()))
                        "readFile" -> respond(callback, JSONObject().put("ok", true).put("content", storage.read(p.getString("uri"))))
                        "writeFile" -> {
                            val ok = storage.write(p.optString("uri"), p.optString("name", "Novo documento.txt"), p.optString("content"))
                            respond(callback, JSONObject().put("ok", ok).put("error", if (ok) "" else "Não foi possível salvar"))
                        }
                        "createFolder" -> {
                            val ok = storage.createFolder(p.optString("name", "Nova pasta"))
                            respond(callback, JSONObject().put("ok", ok).put("error", if (ok) "" else "Selecione um armazenamento"))
                        }
                        "openFile" -> runOnUiThread {
                            try {
                                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(p.getString("uri"))).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                                respond(callback, JSONObject().put("ok", true))
                            } catch (_: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", "Nenhum aplicativo pode abrir este arquivo."))
                            }
                        }
                        "pickStorage" -> runOnUiThread {
                            pendingCallback = callback
                            val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
                            startActivityForResult(intent, treeRequest)
                        }
                        "checkUpdate" -> Updater(this@MainActivity).check { result ->
                            val message = if (result.startsWith("update|")) "Atualização disponível: " + result.split("|").getOrElse(1) { "" } else "O aplicativo já está atualizado."
                            respond(callback, JSONObject().put("ok", true).put("message", message))
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
                web.evaluateJavascript("window.__nativeResult(" + JSONObject.quote(id) + "," + JSONObject.quote(result.toString()) + ")", null)
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != treeRequest) return
        val callback = pendingCallback
        pendingCallback = null
        if (resultCode == Activity.RESULT_OK && data?.data != null) {
            storage.rememberTree(data.data!!)
            callback?.let { respondJs(it, JSONObject().put("ok", true).put("label", storage.label())) }
        } else callback?.let { respondJs(it, JSONObject().put("ok", false).put("error", "Seleção cancelada")) }
    }

    private fun respondJs(id: String, result: JSONObject) {
        web.evaluateJavascript("window.__nativeResult(" + JSONObject.quote(id) + "," + JSONObject.quote(result.toString()) + ")", null)
    }

    override fun onDestroy() {
        pool.shutdownNow()
        web.removeJavascriptInterface("Android")
        super.onDestroy()
    }
}