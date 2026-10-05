package com.korczak.documents

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.os.StatFs
import android.provider.DocumentsContract
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

class StorageManager(private val context: Context) {
    private val prefs = context.getSharedPreferences("kzdoc_storage", Context.MODE_PRIVATE)
    private val trashPrefsKey = "trash_entries_v1"
    private val trashFolderName = ".NexusTrash"

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
                if (f.isDirectory && name == trashFolderName) return@forEach
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
                        .put("uri", treeUriForDocument(folder.uri).toString())
                )
            }
        return a
    }

    private fun treeUriForDocument(uri: Uri): Uri {
        if (DocumentsContract.isTreeUri(uri)) return uri
        val authority = uri.authority ?: return uri
        val documentId = try {
            DocumentsContract.getDocumentId(uri)
        } catch (_: IllegalArgumentException) {
            return uri
        }
        return DocumentsContract.buildTreeDocumentUri(authority, documentId)
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

    fun rename(uri: String, name: String): Boolean {
        val file = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: return false
        return file.renameTo(safe(name))
    }

    fun trash(uri: String): JSONObject {
        val source = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: return JSONObject().put("ok", false).put("error", "Arquivo não encontrado")
        if (!source.exists() || source.isDirectory) return JSONObject().put("ok", false).put("error", "Somente arquivos podem ser enviados para a lixeira")
        val root = savedTree()?.let { DocumentFile.fromTreeUri(context, it) } ?: return JSONObject().put("ok", false).put("error", "Selecione uma pasta do Nexus primeiro")
        val trash = root.findFile(trashFolderName) ?: root.createDirectory(trashFolderName)
            ?: return JSONObject().put("ok", false).put("error", "Não foi possível preparar a lixeira")
        val parent = findParent(root, source.uri)
            ?: return JSONObject().put("ok", false).put("error", "Não foi possível localizar a pasta original")
        val originalName = source.name ?: "Arquivo"
        val trashName = uniqueName(trash, originalName)
        val target = trash.createFile(source.type ?: mimeFor(originalName), trashName)
            ?: return JSONObject().put("ok", false).put("error", "Não foi possível mover o arquivo para a lixeira")
        try {
            val input = context.contentResolver.openInputStream(source.uri) ?: throw IllegalStateException("Não foi possível ler o arquivo")
            val output = context.contentResolver.openOutputStream(target.uri) ?: throw IllegalStateException("Não foi possível gravar na lixeira")
            input.use { i -> output.use { o -> i.copyTo(o) } }
            if (!source.delete()) {
                target.delete()
                return JSONObject().put("ok", false).put("error", "O arquivo foi copiado, mas o original não pôde ser removido")
            }
            val entries = readTrashEntries()
            entries.put(
                JSONObject()
                    .put("trashUri", target.uri.toString())
                    .put("originalParent", treeUriForDocument(parent.uri).toString())
                    .put("originalName", originalName)
                    .put("deletedAt", System.currentTimeMillis())
            )
            saveTrashEntries(entries)
            return JSONObject().put("ok", true).put("name", originalName)
        } catch (e: Exception) {
            try { target.delete() } catch (_: Exception) {}
            return JSONObject().put("ok", false).put("error", e.message ?: "Não foi possível mover para a lixeira")
        }
    }

    fun listTrash(): JSONArray {
        val result = JSONArray()
        val entries = readTrashEntries()
        for (i in 0 until entries.length()) {
            val e = entries.optJSONObject(i) ?: continue
            val uri = e.optString("trashUri")
            val file = runCatching { DocumentFile.fromSingleUri(context, Uri.parse(uri)) }.getOrNull()
            if (file?.exists() == true) {
                result.put(
                    JSONObject()
                        .put("name", e.optString("originalName", file.name ?: "Arquivo"))
                        .put("uri", uri)
                        .put("deletedAt", e.optLong("deletedAt"))
                        .put("size", file.length())
                        .put("mime", file.type ?: mimeFor(file.name))
                )
            }
        }
        return result
    }

    fun restoreTrash(uri: String): JSONObject {
        val entries = readTrashEntries()
        var found: JSONObject? = null
        var foundIndex = -1
        for (i in 0 until entries.length()) {
            val e = entries.optJSONObject(i) ?: continue
            if (e.optString("trashUri") == uri) { found = e; foundIndex = i; break }
        }
        val entry = found ?: return JSONObject().put("ok", false).put("error", "Item não encontrado na lixeira")
        val source = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: return JSONObject().put("ok", false).put("error", "Arquivo da lixeira não existe")
        val parent = DocumentFile.fromTreeUri(context, Uri.parse(entry.optString("originalParent")))
            ?: return JSONObject().put("ok", false).put("error", "A pasta original não está mais disponível")
        val originalName = entry.optString("originalName", source.name ?: "Arquivo")
        val target = parent.createFile(source.type ?: mimeFor(originalName), uniqueName(parent, originalName))
            ?: return JSONObject().put("ok", false).put("error", "Não foi possível restaurar o arquivo")
        return try {
            val input = context.contentResolver.openInputStream(source.uri) ?: throw IllegalStateException("Não foi possível ler o item da lixeira")
            val output = context.contentResolver.openOutputStream(target.uri) ?: throw IllegalStateException("Não foi possível gravar o arquivo restaurado")
            input.use { i -> output.use { o -> i.copyTo(o) } }
            if (!source.delete()) {
                target.delete()
                throw IllegalStateException("Não foi possível concluir a restauração")
            }
            entries.remove(foundIndex)
            saveTrashEntries(entries)
            JSONObject().put("ok", true).put("name", target.name ?: originalName)
        } catch (e: Exception) {
            try { target.delete() } catch (_: Exception) {}
            JSONObject().put("ok", false).put("error", e.message ?: "Não foi possível restaurar")
        }
    }

    fun permanentDeleteTrash(uri: String): Boolean {
        val entries = readTrashEntries()
        var foundIndex = -1
        for (i in 0 until entries.length()) {
            if (entries.optJSONObject(i)?.optString("trashUri") == uri) { foundIndex = i; break }
        }
        val file = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: return false
        val ok = file.delete()
        if (ok && foundIndex >= 0) {
            entries.remove(foundIndex)
            saveTrashEntries(entries)
        }
        return ok
    }

    private fun readTrashEntries(): JSONArray = try {
        JSONArray(prefs.getString(trashPrefsKey, "[]") ?: "[]")
    } catch (_: Exception) { JSONArray() }

    private fun saveTrashEntries(entries: JSONArray) {
        prefs.edit().putString(trashPrefsKey, entries.toString()).apply()
    }

    private fun findParent(folder: DocumentFile, targetUri: Uri): DocumentFile? {
        folder.listFiles().forEach { child ->
            if (child.uri == targetUri) return folder
            if (child.isDirectory && child.name != trashFolderName) {
                val found = findParent(child, targetUri)
                if (found != null) return found
            }
        }
        return null
    }

    private fun uniqueName(folder: DocumentFile, desired: String): String {
        val clean = safe(desired)
        if (folder.findFile(clean) == null) return clean
        val dot = clean.lastIndexOf('.')
        val base = if (dot > 0) clean.substring(0, dot) else clean
        val ext = if (dot > 0) clean.substring(dot) else ""
        var i = 2
        while (folder.findFile("$base ($i)$ext") != null) i++
        return "$base ($i)$ext"
    }

    fun copy(uri: String, folderUri: String, name: String): Pair<Boolean, String?> {
        val source = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: return false to null
        val folder = DocumentFile.fromTreeUri(context, Uri.parse(folderUri)) ?: return false to null
        if (!folder.isDirectory) return false to null
        val target = folder.createFile(source.type ?: mimeFor(source.name), safe(name.ifBlank { source.name ?: "Arquivo" })) ?: return false to null
        val input = context.contentResolver.openInputStream(source.uri) ?: return false to null
        val output = context.contentResolver.openOutputStream(target.uri) ?: return false to null
        input.use { i -> output.use { o -> i.copyTo(o) } }
        return true to target.uri.toString()
    }

    fun fileInfo(uri: String): JSONObject {
        val file = DocumentFile.fromSingleUri(context, Uri.parse(uri)) ?: throw IllegalStateException("Arquivo não encontrado")
        return JSONObject()
            .put("name", file.name ?: "Arquivo")
            .put("uri", file.uri.toString())
            .put("mime", file.type ?: mimeFor(file.name))
            .put("size", file.length())
            .put("modified", file.lastModified())
            .put("directory", file.isDirectory)
            .put("readable", file.canRead())
            .put("writable", file.canWrite())
            .put("exists", file.exists())
    }

    fun zipFiles(uris: JSONArray, folderUri: String, zipName: String): Pair<Boolean, String?> {
        val folder = DocumentFile.fromTreeUri(context, Uri.parse(folderUri)) ?: return false to null
        if (!folder.isDirectory) return false to null
        val target = folder.createFile("application/zip", safe(if (zipName.endsWith(".zip", true)) zipName else "$zipName.zip")) ?: return false to null
        val output = context.contentResolver.openOutputStream(target.uri) ?: return false to null
        java.util.zip.ZipOutputStream(output.buffered()).use { zip ->
            for (i in 0 until uris.length()) {
                val uri = Uri.parse(uris.optString(i))
                val source = DocumentFile.fromSingleUri(context, uri) ?: continue
                val input = context.contentResolver.openInputStream(uri) ?: continue
                zip.putNextEntry(java.util.zip.ZipEntry(source.name ?: "Arquivo-$i"))
                input.use { it.copyTo(zip) }
                zip.closeEntry()
            }
        }
        return true to target.uri.toString()
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
