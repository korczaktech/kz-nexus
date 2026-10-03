package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
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
    private val fileRequest = 7002
    private var pendingFileCallback: String? = null
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

        requestStartupPermissions()
        Updater(this).resumePending()
        Updater(this).check { result ->
            if (result.startsWith("update|")) {
                val parts = result.split("|", limit = 4)
                runOnUiThread {
                    AlertDialog.Builder(this)
                        .setTitle("Atualização disponível")
                        .setMessage("Korczak Nexus " + parts.getOrElse(1) { "" } + " está disponível. Deseja instalar?")
                        .setNegativeButton("Depois", null)
                        .setPositiveButton("Instalar") { _, _ ->
                            Updater(this).install(
                                parts.getOrElse(2) { "" },
                                parts.getOrElse(3) { "" }
                            ) { status ->
                                if (status.startsWith("failed|")) {
                                    AlertDialog.Builder(this)
                                        .setTitle("Falha na atualização")
                                        .setMessage(status.removePrefix("failed|"))
                                        .setPositiveButton("OK", null)
                                        .show()
                                }
                            }
                        }
                        .show()
                }
            }
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

        AlertDialog.Builder(this)
            .setTitle("Permissão necessária")
            .setMessage("O Nexus precisa de: $permission. Essa autorização é usada para acessar os arquivos e manter o aplicativo atualizável.")
            .setNegativeButton("Agora não") { _, _ ->
                permissionFlowActive = false
            }
            .setPositiveButton("Autorizar") { _, _ ->
                when (permission) {
                    "Acesso amplo ao armazenamento" -> {
                        try {
                            startActivity(
                                Intent(
                                    Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                    Uri.parse("package:$packageName")
                                )
                            )
                        } catch (_: Exception) {
                            startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                        }
                    }
                    "Permissão para instalar atualizações do Nexus" -> {
                        startActivity(
                            Intent(
                                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:$packageName")
                            )
                        )
                    }
                }
            }
            .setOnDismissListener {
                // Não abre outra permissão por timer. O Android devolve o controle
                // ao app e onResume() verifica novamente o estado real.
                if (!isFinishing) {
                    window.decorView.post {
                        val remaining = missingStartupPermissions()
                        if (remaining.isEmpty()) {
                            permissionFlowActive = false
                        } else {
                            permissionFlowActive = false
                        }
                    }
                }
            }
            .show()
    }

    override fun onResume() {
        super.onResume()
        if (!permissionFlowActive) requestStartupPermissions()
        Updater(this).resumePending()
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
                        "session" -> {
                            val result =
                                if (session.token != null && session.userJson != null)
                                    JSONObject().put("ok", true).put("user", JSONObject(session.userJson!!))
                                else JSONObject().put("ok", false)
                            respond(callback, result)
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

                            val data: Any =
                                if (response.body.isBlank()) JSONObject()
                                else try { JSONObject(response.body) } catch (_: Exception) { JSONArray(response.body) }

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

                        "storageInfo", "listFiles" -> {
                            val result = storage.deviceStorage().put("files", storage.listFiles())
                            respond(callback, JSONObject().put("ok", true).put("label", storage.label()).put("files", storage.listFiles()).put("total", result.optLong("total")).put("available", result.optLong("available")).put("used", result.optLong("used")).put("allFiles", result.optBoolean("allFiles")))
                        }

                        "requestStorage" -> runOnUiThread {
                            if (android.os.Build.VERSION.SDK_INT >= 30) {
                                try {
                                    startActivity(
                                        Intent(
                                            Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                                            Uri.parse("package:$packageName")
                                        )
                                    )
                                    respondJs(
                                        callback,
                                        JSONObject().put("ok", true).put("message", "A tela de acesso ao armazenamento do Android foi aberta.")
                                    )
                                } catch (_: Exception) {
                                    startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
                                    respondJs(callback, JSONObject().put("ok", true).put("message", "A tela de acesso ao armazenamento foi aberta."))
                                }
                            } else {
                                respondJs(callback, JSONObject().put("ok", true).put("message", "Nesta versão do Android o acesso amplo não precisa de uma tela especial."))
                            }
                        }

                        "readFile" -> respond(
                            callback,
                            JSONObject().put("ok", true).put("content", storage.read(p.getString("uri")))
                        )

                        "writeFile" -> {
                            val result = storage.write(
                                p.optString("uri"),
                                p.optString("name", "Novo documento.kzdoc"),
                                p.optString("content")
                            )
                            respond(
                                callback,
                                JSONObject()
                                    .put("ok", result.first)
                                    .put("uri", result.second ?: "")
                                    .put("error", if (result.first) "" else "Selecione um armazenamento para salvar o documento")
                            )
                        }

                        "createFolder" -> {
                            val ok = storage.createFolder(p.optString("name", "Nova pasta"))
                            respond(
                                callback,
                                JSONObject().put("ok", ok).put("error", if (ok) "" else "Selecione um armazenamento")
                            )
                        }

                        "openFile" -> runOnUiThread {
                            try {
                                startActivity(
                                    Intent(Intent.ACTION_VIEW, Uri.parse(p.getString("uri")))
                                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                )
                                respond(callback, JSONObject().put("ok", true))
                            } catch (_: Exception) {
                                respond(callback, JSONObject().put("ok", false).put("error", "Nenhum aplicativo pode abrir este arquivo."))
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

                        "checkUpdate" -> Updater(this@MainActivity).check { result ->
                            val message =
                                if (result.startsWith("update|"))
                                    "Atualização disponível: " + result.split("|").getOrElse(1) { "" }
                                else "O aplicativo já está atualizado."
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
            storage.rememberTree(data.data!!)
            callback?.let {
                respondJs(it, JSONObject().put("ok", true).put("label", storage.label()))
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
