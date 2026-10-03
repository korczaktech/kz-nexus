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

    fun rememberTree(uri: Uri): Boolean {
        return try {
            context.contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
            prefs.edit().putString("tree", uri.toString()).apply()
            true
        } catch (_: SecurityException) {
            false
        } catch (_: UnsupportedOperationException) {
            false
        }
    }

    fun clearTree() = prefs.edit().remove("tree").apply()

    fun label(): String = savedTree()?.let {
        DocumentFile.fromTreeUri(context, it)?.name ?: it.authority ?: "Armazenamento"
    } ?: "Nenhum armazenamento selecionado"

    fun hasTree(): Boolean = savedTree() != null

    fun listFiles(): JSONArray {
        val a = JSONArray()
        val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return a
        collectFiles(root, "", a)
        return a
    }

    private fun collectFiles(folder: DocumentFile, relativePath: String, out: JSONArray) {
        folder.listFiles()
            .sortedWith(compareBy<DocumentFile> { !it.isDirectory }.thenBy { (it.name ?: "").lowercase() })
            .forEach { f ->
                val name = f.name ?: "Arquivo"
                val path = if (relativePath.isBlank()) name else "$relativePath/$name"
                if (f.isDirectory) {
                    collectFiles(f, path, out)
                } else {
                    val mime = f.type ?: mimeFor(name)
                    out.put(
                        JSONObject()
                            .put("name", name)
                            .put("path", path)
                            .put("uri", f.uri.toString())
                            .put("mime", mime)
                            .put("size", f.length())
                            .put("modified", f.lastModified())
                            .put("editable", isEditableDocument(name, mime))
                    )
                }
            }
    }

    fun listFolders(uri: String? = null): JSONArray {
        val a = JSONArray()
        val root = if (uri.isNullOrBlank()) {
            savedTree()?.let { DocumentFile.fromTreeUri(context, it) }
        } else {
            DocumentFile.fromTreeUri(context, Uri.parse(uri))
        } ?: return a

        root.listFiles()
            .filter { it.isDirectory }
            .sortedBy { (it.name ?: "").lowercase() }
            .forEach { folder ->
                a.put(
                    JSONObject()
                        .put("name", folder.name ?: "Pasta")
                        .put("uri", folder.uri.toString())
                )
            }
        return a
    }

    fun saveInFolder(folderUri: String, name: String, content: String): Pair<Boolean, String?> {
        val folder = DocumentFile.fromTreeUri(context, Uri.parse(folderUri)) ?: return false to null
        if (!folder.isDirectory) return false to null

        val safeName = safe(name)
        val existing = folder.findFile(safeName)
        val target = existing ?: folder.createFile("application/json", safeName) ?: return false to null
        val output = context.contentResolver.openOutputStream(target.uri, "wt") ?: return false to null
        output.use {
            it.write(content.toByteArray(Charsets.UTF_8))
            it.flush()
        }
        return true to target.uri.toString()
    }

    private fun collectCompatibleFiles(folder: DocumentFile, out: JSONArray) {
        folder.listFiles().forEach { f ->
            if (f.isDirectory) {
                collectCompatibleFiles(f, out)
            } else if (isEditableDocument(f.name, f.type)) {
                out.put(
                    JSONObject()
                        .put("name", f.name ?: "Arquivo")
                        .put("uri", f.uri.toString())
                        .put("mime", f.type ?: mimeFor(f.name))
                        .put("size", f.length())
                        .put("modified", f.lastModified())
                )
            }
        }
    }

    private fun isEditableDocument(name: String?, mime: String?): Boolean {
        val ext = name?.substringAfterLast('.', "")?.lowercase() ?: ""
        return ext in setOf(
            "txt", "text", "log", "md", "markdown", "rtf", "csv", "json", "yaml", "yml", "toml", "ini", "conf", "properties", "css", "js", "mjs", "cjs", "ts", "tsx", "jsx",
            "doc", "docx", "dot", "dotx", "docm", "dotm",
            "odt", "ott", "fodt", "wps", "pages", "pdf", "xml", "html", "htm", "kzdoc"
        ) || mime.orEmpty().lowercase() in setOf(
            "text/plain", "text/markdown", "text/csv", "application/json", "text/yaml", "text/x-yaml", "text/rtf", "text/html",
            "application/rtf", "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.template",
            "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.text-template", "application/pdf"
        )
    }

    private fun mimeFor(name: String?): String {
        return when (name?.substringAfterLast('.', "")?.lowercase()) {
            "txt", "text", "log", "ini", "conf", "properties" -> "text/plain"
            "md", "markdown" -> "text/markdown"
            "csv" -> "text/csv"
            "json" -> "application/json"
            "yaml", "yml" -> "text/yaml"
            "rtf" -> "application/rtf"
            "doc" -> "application/msword"
            "docx", "docm" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            "dot", "dotm", "dotx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.template"
            "odt", "ott", "fodt" -> "application/vnd.oasis.opendocument.text"
            "pdf" -> "application/pdf"
            "html", "htm" -> "text/html"
            "xml" -> "application/xml"
            "kzdoc" -> "application/json"
            else -> "application/octet-stream"
        }
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
        val stat = StatFs(Environment.getDataDirectory().path)
        val total = stat.totalBytes
        val available = stat.availableBytes
        return JSONObject()
            .put("total", total)
            .put("available", available)
            .put("used", total - available)
            .put("allFiles", if (android.os.Build.VERSION.SDK_INT >= 30) Environment.isExternalStorageManager() else true)
            .put("documentStats", documentStats())
    }

    private fun documentStats(): JSONObject {
        val extensions = setOf("txt","text","md","markdown","rtf","doc","docx","docm","dot","dotx","dotm","odt","ott","fodt","wps","pages","pdf","xml","html","htm","kzdoc")
        val counts = JSONObject()
        extensions.forEach { counts.put(it, 0) }
        val root = Environment.getExternalStorageDirectory()
        val result = longArrayOf(0, 0)
        scanDocumentFiles(root, extensions, counts, result)
        return JSONObject().put("total", result[0]).put("bytes", result[1]).put("byExtension", counts).put("scope", "armazenamento externo acessível ao Nexus")
    }

    private fun scanDocumentFiles(file: java.io.File, extensions: Set<String>, counts: JSONObject, result: LongArray) {
        val children = try { file.listFiles() } catch (_: SecurityException) { null } ?: return
        for (child in children) {
            if (child.isDirectory) {
                scanDocumentFiles(child, extensions, counts, result)
            } else {
                val ext = child.name.substringAfterLast('.', "").lowercase()
                if (ext in extensions) {
                    result[0]++
                    result[1] += child.length()
                    counts.put(ext, counts.optInt(ext) + 1)
                }
            }
        }
    }

    private fun safe(n: String) =
        n.replace(Regex("[\\/:*?\"<>|]"), "_").ifBlank { "Novo documento.kzdoc" }

    private object BuildConfigHelper {
        fun hasAllFilesAccess(): Boolean =
            android.os.Build.VERSION.SDK_INT < 30 || Environment.isExternalStorageManager()
    }
}
