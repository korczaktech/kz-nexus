package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

class MainActivity:AppCompatActivity(){
 private lateinit var web:WebView;private lateinit var session:SessionStore;private lateinit var api:ApiClient;private lateinit var storage:StorageManager
 private val pool=Executors.newCachedThreadPool();private val treeRequest=7001;private var pending:String?=null
 override fun onCreate(s:Bundle?){super.onCreate(s);session=SessionStore(this);api=ApiClient(session);storage=StorageManager(this)
  web=WebView(this).apply{settings.javaScriptEnabled=true;settings.domStorageEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=true;webViewClient=WebViewClient();webChromeClient=WebChromeClient();addJavascriptInterface(Bridge(),"Android")}
  setContentView(web);web.loadUrl("file:///android_asset/index.html")
  Updater(this).check{r->if(r.startsWith("update|")){val p=r.split("|",limit=4);AlertDialog.Builder(this).setTitle("Atualização disponível").setMessage("KZ Documents "+p[1]+" está disponível. Deseja instalar?").setNegativeButton("Depois",null).setPositiveButton("Instalar"){_,_->Updater(this).install(p[2],p.getOrElse(3){""}){}}.show()}}
 }
 inner class Bridge{
  @JavascriptInterface fun call(action:String,payload:String,cb:String){pool.execute{try{val p=JSONObject(payload);when(action){
   "session"->respond(cb,if(session.token!=null&&session.userJson!=null)JSONObject().put("ok",true).put("user",JSONObject(session.userJson!!)) else JSONObject().put("ok",false))
   "api"->{val r=api.request(p.optString("method","GET"),p.optString("path"),p.optString("body").takeIf{it.isNotEmpty()});val data=if(r.body.isBlank())JSONObject() else try{JSONObject(r.body)}catch(_:Exception){JSONArray(r.body)};respond(cb,JSONObject().put("ok",r.code in 200..299).put("status",r.code).put("data",data).put("error",if(r.code in 200..299)"" else api.errorMessage(r)))}
   "logout"->{api.logout();session.clear();respond(cb,JSONObject().put("ok",true))}
   "storageInfo","listFiles"->respond(cb,JSONObject().put("ok",true).put("label",storage.label()).put("files",storage.listFiles()))
   "readFile"->respond(cb,JSONObject().put("ok",true).put("content",storage.read(p.getString("uri"))))
   "writeFile"->{val ok=storage.write(p.optString("uri"),p.optString("name","Novo documento.txt"),p.optString("content"));respond(cb,JSONObject().put("ok",ok).put("error",if(ok)"" else "Não foi possível salvar"))}
   "createFolder"->{val ok=storage.createFolder(p.optString("name","Nova pasta"));respond(cb,JSONObject().put("ok",ok).put("error",if(ok)"" else "Selecione um armazenamento"))}
   "openFile"->runOnUiThread{try{startActivity(Intent(Intent.ACTION_VIEW,Uri.parse(p.getString("uri"))).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));respond(cb,JSONObject().put("ok",true))}catch(e:Exception){respond(cb,JSONObject().put("ok",false).put("error","Nenhum aplicativo pode abrir este arquivo."))}}
   "pickStorage"->runOnUiThread{pending=cb;startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),treeRequest)}
   "checkUpdate"->Updater(this@MainActivity).check{r->respond(cb,JSONObject().put("ok",true).put("message",if(r.startsWith("update|"))"Atualização disponível: "+r.split("|")[1] else "O aplicativo já está atualizado."))}
   else->respond(cb,JSONObject().put("ok",false).put("error","Ação não suportada"))
  }}catch(e:Exception){respond(cb,JSONObject().put("ok",false).put("error",e.message?:"Erro interno"))}}}}
  private fun respond(id:String,o:JSONObject){runOnUiThread{web.evaluateJavascript("window.__nativeResult("+JSONObject.quote(id)+","+JSONObject.quote(o.toString())+")",null)}}
 }
 override fun onActivityResult(r:Int,c:Int,d:Intent?){super.onActivityResult(r,c,d);if(r==treeRequest){val cb=pending;pending=null;if(c==Activity.RESULT_OK&&d?.data!=null){storage.rememberTree(d.data!!);cb?.let{respondJs(it,JSONObject().put("ok",true).put("label",storage.label()))}}else cb?.let{respondJs(it,JSONObject().put("ok",false).put("error","Seleção cancelada"))}}}
 private fun respondJs(id:String,o:JSONObject){web.evaluateJavascript("window.__nativeResult("+JSONObject.quote(id)+","+JSONObject.quote(o.toString())+")",null)}
 override fun onDestroy(){pool.shutdownNow();web.removeJavascriptInterface("Android");super.onDestroy()}
}