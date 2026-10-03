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
    private val repo = "korczaktech/kzdoc"
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
                if (url.isBlank() || !url.startsWith("https://github.com/") || !url.contains("/releases/download/")) {
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
                try {
                    apk.inputStream().use { input ->
                        session.openWrite("base.apk", 0, apk.length()).use { output ->
                            input.copyTo(output)
                            session.fsync(output)
                        }
                    }

                    val callback = Intent(activity, UpdateReceiver::class.java).apply {
                        action = "com.korczak.documents.UPDATE_RESULT"
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                        if (android.os.Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE
                        else if (android.os.Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE
                        else 0
                    val pending = PendingIntent.getBroadcast(activity, 7401, callback, flags)
                    session.commit(pending.intentSender)
                    committed = true
                } finally {
                    if (!committed) try { session.abandon() } catch (_: Exception) {}
                    session.close()
                }

                activity.runOnUiThread { onDone("installer") }
            } catch (e: Exception) {
                try { apk.delete() } catch (_: Exception) {}
                activity.runOnUiThread {
                    onDone("failed|" + (e.message ?: "Não foi possível instalar a atualização"))
                }
            }
        }.start()
    }

    fun resumePending() {
        val prefs = activity.getSharedPreferences(prefsName, Activity.MODE_PRIVATE)
        val url = prefs.getString("pending_url", null) ?: return
        val digest = prefs.getString("pending_digest", "") ?: ""
        if (android.os.Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        install(url, digest) { result ->
            if (result == "installer") prefs.edit().clear().apply()
        }
    }

    private fun download(url: String, apk: File) {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true
        c.connectTimeout = 20000
        c.readTimeout = 180000
        c.setRequestProperty("Cache-Control", "no-cache, no-store")
        c.setRequestProperty("User-Agent", "Korczak-Nexus-Updater")
        c.setRequestProperty("Accept", "application/octet-stream")
        c.setRequestProperty("X-GitHub-Api-Version", "2022-11-28")
        val code = c.responseCode
        if (code !in 200..299) {
            val detail = try { c.errorStream?.bufferedReader()?.use { it.readText().take(240) } } catch (_: Exception) { null }
            c.disconnect()
            throw IllegalStateException("Download HTTP $code" + if (detail.isNullOrBlank()) "" else ": $detail")
        }
        val contentType = c.contentType.orEmpty()
        c.inputStream.use { input -> apk.outputStream().use { output -> input.copyTo(output) } }
        c.disconnect()
        if (apk.length() < 100000L) throw IllegalStateException("APK baixado está incompleto")
        if (contentType.contains("text/html", ignoreCase = true)) throw IllegalStateException("O GitHub devolveu uma página em vez do APK")
    }

    private fun verify(apk: File, expected: String) {
        val md = MessageDigest.getInstance("SHA-256")
        apk.inputStream().use { input ->
            val buffer = ByteArray(8192)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                md.update(buffer, 0, n)
            }
        }
        val actual = md.digest().joinToString("") { "%02x".format(it) }
        if (expected.isNotBlank() && !actual.equals(expected, true)) {
            throw IllegalStateException("Integridade do APK inválida")
        }
    }

    private fun compare(a: String, b: String): Int {
        val x = a.split(".").map { it.toIntOrNull() ?: 0 }
        val y = b.split(".").map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val l = x.getOrElse(i) { 0 }
            val r = y.getOrElse(i) { 0 }
            if (l != r) return l.compareTo(r)
        }
        return 0
    }
}
