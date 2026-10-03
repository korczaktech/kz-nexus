package com.korczak.documents

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.documentfile.provider.DocumentFile
import org.json.JSONArray
import org.json.JSONObject

class StorageManager(private val context:Context){
 private val prefs=context.getSharedPreferences("kzdoc_storage",Context.MODE_PRIVATE)
 fun savedTree():Uri?=prefs.getString("tree",null)?.let(Uri::parse)
 fun rememberTree(uri:Uri){context.contentResolver.takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION);prefs.edit().putString("tree",uri.toString()).apply()}
 fun clearTree(){prefs.edit().remove("tree").apply()}
 fun label():String=savedTree()?.let{DocumentFile.fromTreeUri(context,it)?.name?:it.authority?:"Armazenamento"}?:"Nenhum armazenamento selecionado"
 fun listFiles():JSONArray{val a=JSONArray();val root=savedTree()?.let{DocumentFile.fromTreeUri(context,it)}?:return a;root.listFiles().forEach{f->if(f.isFile)a.put(JSONObject().put("name",f.name?:"Arquivo").put("uri",f.uri.toString()).put("mime",f.type?:"application/octet-stream").put("size",f.length()))};return a}
 fun importFile(uri:Uri):Boolean{val root=savedTree()?.let{DocumentFile.fromTreeUri(context,it)}?:return false;val source=DocumentFile.fromSingleUri(context,uri)?:return false;val target=root.createFile(source.type?:"application/octet-stream",safe(source.name?:"Arquivo"))?:return false;context.contentResolver.openInputStream(uri)?.use{input->context.contentResolver.openOutputStream(target.uri)?.use{output->input.copyTo(output)}}?:return false;return true}
 fun createFolder(name:String):Boolean{val root=savedTree()?.let{DocumentFile.fromTreeUri(context,it)}?:return false;return root.createDirectory(safe(name))!=null}
 fun read(uri:String):String=context.contentResolver.openInputStream(Uri.parse(uri))?.bufferedReader().use{it?.readText()?:throw IllegalStateException("Não foi possível ler o arquivo")}
 fun write(uri:String,name:String,content:String):Boolean{val u=if(uri.isBlank()){val root=savedTree()?.let{DocumentFile.fromTreeUri(context,it)}?:return false;(root.createFile("text/plain",safe(name))?:return false).uri}else Uri.parse(uri);context.contentResolver.openOutputStream(u,"wt")?.use{it.write(content.toByteArray(Charsets.UTF_8));it.flush();return true};return false}
 private fun safe(n:String)=n.replace(Regex("[\\/:*?\"<>|]"),"_").ifBlank{"Novo documento.txt"}
}