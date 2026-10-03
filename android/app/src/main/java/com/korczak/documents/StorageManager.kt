package com.korczak.documents

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.DocumentsContract
import java.io.OutputStreamWriter

class StorageManager(private val context:Context){
    private val prefs=context.getSharedPreferences("kzdoc_storage",Context.MODE_PRIVATE)
    fun savedTree():Uri?=prefs.getString("tree",null)?.let(Uri::parse)
    fun rememberTree(uri:Uri){context.contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION);prefs.edit().putString("tree",uri.toString()).apply()}
    fun clearTree(){prefs.edit().remove("tree").apply()}
    fun createTextFile(name:String,content:String):Boolean{
        val tree=savedTree()?:return false
        val doc=DocumentsContract.buildDocumentUriUsingTree(tree,DocumentsContract.getTreeDocumentId(tree))
        val created=DocumentsContract.createDocument(context.contentResolver,doc,"text/plain",name)?:return false
        context.contentResolver.openOutputStream(created,"w")?.use{OutputStreamWriter(it).use{w->w.write(content)}}?:return false
        return true
    }
    fun label():String=savedTree()?.authority?:"Nenhum armazenamento selecionado"
}
