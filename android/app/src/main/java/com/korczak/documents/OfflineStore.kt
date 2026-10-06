package com.korczak.documents

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import org.json.JSONArray
import org.json.JSONObject

class OfflineStore(private val context: Context) {
    private val prefs = context.getSharedPreferences("nexus_offline_v1", Context.MODE_PRIVATE)
    private val queueKey = "write_queue"
    private val cacheKey = "document_cache"

    fun networkState(): JSONObject {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val n = cm.activeNetwork
        val caps = n?.let { cm.getNetworkCapabilities(it) }
        val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        return JSONObject().put("online", online).put("transport",
            when {
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) == true -> "wifi"
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) == true -> "cellular"
                caps?.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) == true -> "ethernet"
                else -> "offline"
            })
    }

    fun enqueue(uri: String, name: String, content: String): String {
        val id = System.currentTimeMillis().toString() + "-" + (0..9999).random()
        val q = readQueue()
        q.put(JSONObject().put("id",id).put("uri",uri).put("name",name).put("content",content)
            .put("createdAt",System.currentTimeMillis()).put("status","pending"))
        prefs.edit().putString(queueKey,q.toString()).apply()
        return id
    }

    fun remove(id: String) {
        val q=readQueue()
        for(i in q.length()-1 downTo 0) if(q.optJSONObject(i)?.optString("id")==id) q.remove(i)
        prefs.edit().putString(queueKey,q.toString()).apply()
    }

    fun queueSnapshot(): JSONObject = JSONObject().put("items",readQueue()).put("count",readQueue().length())

    fun cacheDocument(uri: String, name: String, content: String) {
        val c=readCache()
        c.put(uri,JSONObject().put("uri",uri).put("name",name).put("content",content).put("cachedAt",System.currentTimeMillis()))
        prefs.edit().putString(cacheKey,c.toString()).apply()
    }

    fun cachedDocument(uri: String): JSONObject? = readCache().optJSONObject(uri)

    fun prune() {
        runCatching {
            val now = System.currentTimeMillis()
            val q = readQueue()
            for (i in q.length() - 1 downTo 0) {
                val item = q.optJSONObject(i)
                if (item == null) {
                    q.remove(i)
                    continue
                }
                val createdAt = item.optLong("createdAt", now).takeIf { it > 0L } ?: now
                val age = (now - createdAt).coerceAtLeast(0L)
                if (age > 7L * 24 * 60 * 60 * 1000) q.remove(i)
            }
            prefs.edit().putString(queueKey, q.toString()).apply()
        }.onFailure {
            android.util.Log.e("KorczakNexus", "Falha ao limpar fila offline; estado será preservado", it)
        }
    }

    private fun readQueue(): JSONArray = runCatching {
        JSONArray(prefs.getString(queueKey, "[]") ?: "[]")
    }.getOrElse {
        android.util.Log.w("KorczakNexus", "Fila offline inválida; iniciando fila vazia", it)
        JSONArray()
    }
    private fun readCache(): JSONObject = runCatching { JSONObject(prefs.getString(cacheKey,"{}") ?: "{}") }.getOrElse { JSONObject() }
}
