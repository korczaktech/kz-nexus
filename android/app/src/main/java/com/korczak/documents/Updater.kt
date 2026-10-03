package com.korczak.documents

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class Updater(private val activity:Activity){
    private val repo="korczaktechnology-tech/kzdoc"
    private val current:String by lazy { activity.packageManager.getPackageInfo(activity.packageName, 0).versionName ?: "0.0.0.1" }

    fun check(done:(String)->Unit){
        Thread{
            try{
                val c=URL("https://api.github.com/repos/"+repo+"/releases/latest").openConnection() as HttpURLConnection
                c.connectTimeout=10000;c.readTimeout=15000;c.setRequestProperty("Accept","application/vnd.github+json")
                val j=JSONObject(c.inputStream.bufferedReader().use{it.readText()});c.disconnect()
                val tag=j.optString("tag_name").removePrefix("v")
                val assets=j.optJSONArray("assets")
                var asset:JSONObject?=null
                if(assets!=null)for(i in 0 until assets.length()){val a=assets.getJSONObject(i);if(a.optString("name").endsWith(".apk")){asset=a;break}}
                if(asset==null||compare(tag,current)<=0){activity.runOnUiThread{done("up_to_date")};return@Thread}
                activity.runOnUiThread{done("update|"+tag+"|"+asset!!.getString("browser_download_url")+"|"+asset!!.optString("digest").removePrefix("sha256:"))}
            }catch(e:Exception){activity.runOnUiThread{done("failed|"+(e.message?:"erro"))}}
        }.start()
    }

    fun install(url: String, expected: String, onDone: (String) -> Unit) {
        Thread {
            val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
            val apk = File(dir, "update.apk")
            try {
                if (android.os.Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) {
                    activity.getSharedPreferences("nexus_updater", Activity.MODE_PRIVATE).edit()
                        .putString("pending_url", url).putString("pending_digest", expected).apply()
                    activity.runOnUiThread {
                        activity.startActivity(Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.packageName)))
                        onDone("permission_install")
                    }
                    return@Thread
                }
                val c = URL(url).openConnection() as HttpURLConnection
                c.instanceFollowRedirects = true
                c.connectTimeout = 20000
                c.readTimeout = 180000
                c.setRequestProperty("User-Agent", "Korczak-Nexus-Updater")
                c.setRequestProperty("Accept", "application/octet-stream")
                if (c.responseCode !in 200..299) throw IllegalStateException("Download HTTP " + c.responseCode)
                c.inputStream.use { input -> apk.outputStream().use { output -> input.copyTo(output) } }
                c.disconnect()
                if (apk.length() < 100000L) throw IllegalStateException("APK baixado está incompleto")
                val md = MessageDigest.getInstance("SHA-256")
                apk.inputStream().use { input ->
                    val buffer = ByteArray(8192)
                    while (true) { val n = input.read(buffer); if (n < 0) break; md.update(buffer, 0, n) }
                }
                val actual = md.digest().joinToString("") { "%02x".format(it) }
                if (expected.isNotBlank() && !actual.equals(expected, true)) throw IllegalStateException("Integridade do APK inválida")
                val uri = androidx.core.content.FileProvider.getUriForFile(activity, activity.packageName + ".fileprovider", apk)
                val intent = Intent(Intent.ACTION_VIEW).apply {
                    setDataAndType(uri, "application/vnd.android.package-archive")
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                activity.runOnUiThread {
                    try { activity.startActivity(intent); onDone("installer") }
                    catch (e: Exception) { onDone("failed|" + (e.message ?: "O Android não conseguiu abrir o instalador")) }
                }
            } catch (e: Exception) {
                activity.runOnUiThread { onDone("failed|" + (e.message ?: "Não foi possível instalar a atualização")) }
            }
        }.start()
    }

    fun resumePending() {
        val prefs = activity.getSharedPreferences("nexus_updater", Activity.MODE_PRIVATE)
        val url = prefs.getString("pending_url", null) ?: return
        val digest = prefs.getString("pending_digest", "") ?: ""
        if (android.os.Build.VERSION.SDK_INT >= 26 && !activity.packageManager.canRequestPackageInstalls()) return
        prefs.edit().clear().apply()
        install(url, digest) {}
    }

    private fun compare(a:String,b:String):Int{
        val x=a.split(".").map{it.toIntOrNull()?:0};val y=b.split(".").map{it.toIntOrNull()?:0}
        for(i in 0 until maxOf(x.size,y.size)){val l=x.getOrElse(i){0};val r=y.getOrElse(i){0};if(l!=r)return l.compareTo(r)}
        return 0
    }
}
