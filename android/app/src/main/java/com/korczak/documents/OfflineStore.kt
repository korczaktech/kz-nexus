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
    private val recoveryKeyPrefix = "write_queue_recovery_"

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
        check(prefs.edit().putString(queueKey,q.toString()).commit()) {
            "Não foi possível persistir a fila offline no armazenamento local."
        }
        return id
    }

    fun remove(id: String) {
        val q=readQueue()
        for(i in q.length()-1 downTo 0) if(q.optJSONObject(i)?.optString("id")==id) q.remove(i)
        check(prefs.edit().putString(queueKey,q.toString()).commit()) {
            "Não foi possível atualizar a fila offline no armazenamento local."
        }
    }

    fun queueSnapshot(): JSONObject = JSONObject().put("items",readQueue()).put("count",readQueue().length())

    /** Retry locally queued file writes. Failed writes stay queued for the next foreground. */
    fun flushPendingWrites(storage: StorageManager): JSONObject {
        val queued = readQueue()
        var saved = 0
        var failed = 0
        for (i in 0 until queued.length()) {
            val item = queued.optJSONObject(i)
            if (item == null) {
                failed++
                continue
            }
            val id = item.optString("id")
            val result = runCatching {
                storage.write(item.optString("uri"), item.optString("name"), item.optString("content"))
            }.getOrNull()
            if (result?.first == true && id.isNotBlank()) {
                remove(id)
                saved++
            } else {
                failed++
            }
        }
        return JSONObject().put("saved", saved).put("failed", failed).put("pending", readQueue().length())
    }

    fun cacheDocument(uri: String, name: String, content: String) {
        val c=readCache()
        c.put(uri,JSONObject().put("uri",uri).put("name",name).put("content",content).put("cachedAt",System.currentTimeMillis()))
        prefs.edit().putString(cacheKey,c.toString()).apply()
    }

    fun cachedDocument(uri: String): JSONObject? = readCache().optJSONObject(uri)

    fun prune() {
        // Pending writes are user data. Never delete them solely because they
        // are old; unresolved operations must remain available for recovery.
        val pending = readQueue().length()
        android.util.Log.i("KorczakNexus", "Fila offline preservada: $pending operação(ões) pendente(s)")
    }

    private fun readQueue(): JSONArray {
        val raw = prefs.getString(queueKey, "[]") ?: "[]"
        return try {
            JSONArray(raw)
        } catch (error: Exception) {
            // Preserve the corrupt payload before allowing a new queue to be written.
            val recoveryKey = recoveryKeyPrefix + System.currentTimeMillis()
            val preserved = prefs.edit().putString(recoveryKey, raw).commit()
            android.util.Log.e(
                "KorczakNexus",
                if (preserved) "Fila offline inválida preservada para recuperação ($recoveryKey)"
                else "Fila offline inválida; falha ao preservar cópia de recuperação",
                error
            )
            JSONArray()
        }
    }
    private fun readCache(): JSONObject = runCatching { JSONObject(prefs.getString(cacheKey,"{}") ?: "{}") }.getOrElse { JSONObject() }
}
