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

    fun install(url:String,expected:String,onDone:(String)->Unit){
        Thread{
            try{
                val dir=File(activity.cacheDir,"updates").apply{mkdirs()}
                val apk=File(dir,"update.apk")
                val c=URL(url).openConnection() as HttpURLConnection
                c.connectTimeout=15000;c.readTimeout=120000
                c.inputStream.use{input->apk.outputStream().use{out->input.copyTo(out)}};c.disconnect()
                val md=MessageDigest.getInstance("SHA-256")
                apk.inputStream().use{input->val b=ByteArray(8192);while(true){val n=input.read(b);if(n<0)break;md.update(b,0,n)}}
                val actual=md.digest().joinToString(""){"%02x".format(it)}
                if(expected.isNotBlank()&&!actual.equals(expected,true))throw IllegalStateException("Integridade do APK inválida")
                val installer=activity.packageManager.packageInstaller
                val params=PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply{setAppPackageName(activity.packageName)}
                val id=installer.createSession(params)
                installer.openSession(id).use{session->
                    apk.inputStream().use{input->session.openWrite("base.apk",0,apk.length()).use{out->input.copyTo(out);session.fsync(out)}}
                    val intent=Intent(activity,UpdateReceiver::class.java)
                    val pi=PendingIntent.getBroadcast(activity,id,intent,PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
                    session.commit(pi.intentSender)
                }
                activity.runOnUiThread{onDone("installing")}
            }catch(e:Exception){activity.runOnUiThread{onDone("failed|"+(e.message?:"erro"))}}
        }.start()
    }

    private fun compare(a:String,b:String):Int{
        val x=a.split(".").map{it.toIntOrNull()?:0};val y=b.split(".").map{it.toIntOrNull()?:0}
        for(i in 0 until maxOf(x.size,y.size)){val l=x.getOrElse(i){0};val r=y.getOrElse(i){0};if(l!=r)return l.compareTo(r)}
        return 0
    }
}
