package com.korczak.documents

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

class StorageManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("kzdoc_storage", Context.MODE_PRIVATE)

    fun savedTree(): Uri? = prefs.getString("tree", null)?.let(Uri::parse)

    fun rememberTree(uri: Uri) {
        context.contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
        )
        prefs.edit().putString("tree", uri.toString()).apply()
    }

    fun clearTree() = prefs.edit().remove("tree").apply()

    fun label(): String = savedTree()?.let {
        DocumentFile.fromTreeUri(context, it)?.name ?: it.authority ?: "Armazenamento"
    } ?: "Nenhum armazenamento selecionado"

    fun hasTree(): Boolean = savedTree() != null

    fun listFiles(): JSONArray {
        val a = JSONArray()
        val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return a
        root.listFiles()
            .filter { it.isFile }
            .sortedByDescending { it.lastModified() }
            .forEach { f ->
                a.put(
                    JSONObject()
                        .put("name", f.name ?: "Arquivo")
                        .put("uri", f.uri.toString())
                        .put("mime", f.type ?: "application/octet-stream")
                        .put("size", f.length())
                        .put("modified", f.lastModified())
                )
            }
        return a
    }

    fun importFile(uri: Uri): Boolean {
        val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return false
        val source = DocumentFile.fromSingleUri(context, uri) ?: return false
        val target = root.createFile(
            source.type ?: "application/octet-stream",
            safe(source.name ?: "Arquivo")
        ) ?: return false

        val input = context.contentResolver.openInputStream(uri) ?: return false
        val output = context.contentResolver.openOutputStream(target.uri) ?: return false
        input.use { i -> output.use { o -> i.copyTo(o) } }
        return true
    }

    fun createFolder(name: String): Boolean {
        val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return false
        return root.createDirectory(safe(name)) != null
    }

    fun read(uri: String): String =
        context.contentResolver.openInputStream(Uri.parse(uri))
            ?.bufferedReader()
            .use { it?.readText() ?: throw IllegalStateException("Não foi possível ler o arquivo") }

    /**
     * If uri is present, overwrite the selected document.
     * If uri is empty, create a new .kzdoc inside the selected Nexus folder.
     */
    fun write(uri: String, name: String, content: String): Pair<Boolean, String?> {
        val target = if (uri.isBlank()) {
            val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return false to null
            root.createFile("application/json", safe(name))?.uri ?: return false to null
        } else Uri.parse(uri)

        val output = context.contentResolver.openOutputStream(target, "wt") ?: return false to null
        output.use {
            it.write(content.toByteArray(Charsets.UTF_8))
            it.flush()
        }
        return true to target.toString()
    }

    fun deviceStorage(): JSONObject {
        val path = Environment.getDataDirectory()
        val stat = StatFs(path.path)
        val total = stat.totalBytes
        val available = stat.availableBytes
        return JSONObject()
            .put("total", total)
            .put("available", available)
            .put("used", (total - available).coerceAtLeast(0L))
            .put("label", label())
            .put("allFiles", BuildConfigHelper.hasAllFilesAccess())
    }

    private fun safe(n: String) =
        n.replace(Regex("[\\/:*?\"<>|]"), "_").ifBlank { "Novo documento.kzdoc" }

    private object BuildConfigHelper {
        fun hasAllFilesAccess(): Boolean =
            android.os.Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()
    }
}
