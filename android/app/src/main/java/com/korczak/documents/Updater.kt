package com.korczak.documents

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class Updater(private val activity: Activity) {
    private val repo = "korczaktech/kz-nexus"
    private val prefsName = "nexus_updater"
    private val updateManifestUrl = "https://raw.githubusercontent.com/" + repo + "/updates/update.json"
    private val current: String by lazy {
        activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "0.0.0.1"
    }

    fun check(done: (String) -> Unit) {
        Thread {
            try {
                val connection = URL(updateManifestUrl + "?t=" + System.currentTimeMillis()).openConnection() as HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 20000
                connection.useCaches = false
                connection.instanceFollowRedirects = true
                connection.setRequestProperty("Cache-Control", "no-cache, no-store")
                connection.setRequestProperty("Pragma", "no-cache")
                connection.setRequestProperty("Accept", "application/json")
                connection.setRequestProperty("User-Agent", "Korczak-Nexus-Updater/3")
                val code = connection.responseCode
                if (code !in 200..299) throw IllegalStateException("Servidor de atualização HTTP " + code)
                val manifest = JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
                connection.disconnect()

                val version = manifest.optString("version").removePrefix("v").trim()
                val url = manifest.optString("url").trim()
                val digest = manifest.optString("sha256").removePrefix("sha256:").trim().lowercase()

                if (!isVersion(version)) throw IllegalStateException("Manifesto de atualização inválido")
                val assetName = url.substringAfterLast("/")
                if (url.isBlank() || !url.startsWith("https://github.com/") || !url.contains("/releases/download/") || !assetName.matches(Regex("^Korczak-HUB-Nexus-[0-9]+(\\.[0-9]+){1,3}\\.apk$"))) {
                    throw IllegalStateException("URL do APK não é confiável")
                }
                if (!digest.matches(Regex("[0-9a-f]{64}"))) {
                    throw IllegalStateException("SHA-256 do APK é inválido")
                }

                if (compare(version, current) <= 0) {
                    activity.runOnUiThread { done("up_to_date") }
                } else {
                    activity.runOnUiThread { done("update|" + version + "|" + url + "|" + digest) }
                }
            } catch (e: Exception) {
                activity.runOnUiThread { done("failed|" + (e.message ?: "erro ao verificar atualização")) }
            }
        }.start()
    }

    fun install(url: String, expected: String, onDone: (String) -> Unit) {
        Thread {
            val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
            val apk = File(dir, "update.apk")
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26 &&
                    !activity.packageManager.canRequestPackageInstalls()) {
                    activity.getSharedPreferences(prefsName, Activity.MODE_PRIVATE).edit()
                        .putString("pending_url", url)
                        .putString("pending_digest", expected)
                        .apply()
                    activity.runOnUiThread {
                        activity.startActivity(
                            Intent(
                                android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + activity.packageName)
                            )
                        )
                        onDone("permission_install")
                    }
                    return@Thread
                }

                download(url, apk)
                verify(apk, expected)

                val installer = activity.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
                    setAppPackageName(activity.packageName)
                    setSize(apk.length())
                    if (android.os.Build.VERSION.SDK_INT >= 31) {
                        setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_REQUIRED)
                    }
                }
                val sessionId = try { installer.createSession(params) } catch (e: Exception) {
                    throw IllegalStateException("Android não conseguiu preparar a instalação: " + (e.message ?: "erro desconhecido"))
                }
                val session = installer.openSession(sessionId)
                var committed = false