package com.korczak.documents

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.widget.*
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject

class MainActivity:AppCompatActivity(){
    private lateinit var session:SessionStore
    private lateinit var api:ApiClient
    private lateinit var storage:StorageManager
    private lateinit var content:LinearLayout
    private val bg=Color.rgb(11,11,15)
    private val surface=Color.rgb(25,24,31)
    private val accent=Color.rgb(103,80,164)
    private val white=Color.WHITE
    private val muted=Color.rgb(190,185,200)
    private val treeRequest=71

    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        session=SessionStore(this);api=ApiClient(session);storage=StorageManager(this)
        if(session.token==null)showLogin() else showApp()
        Updater(this).check{result->
            if(result.startsWith("update|")){
                val p=result.split("|",limit=4)
                AlertDialog.Builder(this).setTitle("Atualização disponível")
                    .setMessage("KZ Documents "+p[1]+" está disponível. Deseja instalar?")
                    .setNegativeButton("Depois",null)
                    .setPositiveButton("Instalar"){_,_->Updater(this).install(p[2],p.getOrElse(3){""}){s->if(s.startsWith("failed"))Toast.makeText(this,s,Toast.LENGTH_LONG).show()}}
                    .show()
            }
        }
    }

    private fun base():LinearLayout=LinearLayout(this).apply{
        orientation=LinearLayout.VERTICAL;setBackgroundColor(bg);setPadding(24,24,24,16)
    }
    private fun title(s:String,size:Float=20f)=TextView(this).apply{text=s;textSize=size;setTextColor(white);setPadding(0,8,0,8)}
    private fun field(h:String)=EditText(this).apply{hint=h;setHintTextColor(muted);setTextColor(white);setSingleLine(true);setPadding(16,12,16,12);setBackgroundColor(surface)}
    private fun btn(s:String,click:()->Unit)=Button(this).apply{text=s;isAllCaps=false;setOnClickListener{click()}}

    private fun showLogin(){
        val root=base();val scroll=ScrollView(this);val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
        box.addView(title("KZ Documents",32f));box.addView(title("BYOS • seus arquivos, seu armazenamento",15f))
        val name=field("Nome");val email=field("E-mail");val pass=field("Senha");pass.inputType=0x81
        box.addView(name);box.addView(email);box.addView(pass)
        var registering=false
        val action=btn("Entrar"){}
        val mode=btn("Criar conta"){}
        fun refresh(){name.visibility=if(registering)View.VISIBLE else View.GONE;action.text=if(registering)"Criar conta" else "Entrar";mode.text=if(registering)"Já tenho uma conta" else "Criar conta"}
        action.setOnClickListener{
            if(email.text.isBlank()||pass.text.isBlank()){Toast.makeText(this,"Preencha e-mail e senha",Toast.LENGTH_SHORT).show();return@setOnClickListener}
            Thread{
                val r=if(registering)api.register(name.text.toString(),email.text.toString(),pass.text.toString()) else api.login(email.text.toString(),pass.text.toString())
                runOnUiThread{if(r.code in 200..299){api.saveSession(r);showApp()}else Toast.makeText(this,api.errorMessage(r),Toast.LENGTH_LONG).show()}
            }.start()
        }
        mode.setOnClickListener{registering=!registering;refresh()}
        box.addView(action);box.addView(mode);box.addView(btn("Recuperar acesso"){recoveryDialog()});refresh();scroll.addView(box);root.addView(scroll);setContentView(root)
    }

    private fun recoveryDialog(){
        val email=field("E-mail");AlertDialog.Builder(this).setTitle("Recuperar acesso").setView(email)
            .setNegativeButton("Cancelar",null).setPositiveButton("Enviar"){_,_->Thread{
                val r=api.request("POST","/api/v1/auth/recovery",JSONObject().put("email",email.text.toString()).toString())
                runOnUiThread{Toast.makeText(this,if(r.code in 200..299)"Solicitação registrada" else api.errorMessage(r),Toast.LENGTH_LONG).show()}
            }.start()}.show()
    }

    private fun showApp(){
        val root=base();root.addView(title("KZ DOCUMENTS  •  "+BuildConfig.VERSION_NAME,21f))
        val nav=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        listOf("Docs","Pastas","Busca","Favoritos","Lixeira","BYOS","Conta").forEach{s->nav.addView(btn(s){load(s)},LinearLayout.LayoutParams(0,-2,1f))}
        root.addView(nav)
        val scroll=ScrollView(this);content=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};scroll.addView(content);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
        setContentView(root);load("Docs")
    }

    private fun load(section:String){
        content.removeAllViews();content.addView(title(section,25f))
        when(section){
            "Docs"->loadArray(api.documents(),"document")
            "Pastas"->loadArray(api.folders(),"folder")
            "Favoritos"->loadArray(api.favorites(),"favorite")
            "Lixeira"->loadArray(api.trash(),"trash")
            "Busca"->searchPanel()
            "BYOS"->byosPanel()
            "Conta"->accountPanel()
        }
    }

    private fun loadArray(result:ApiResult,kind:String){
        Thread{
            val r=result
            runOnUiThread{
                if(r.code==401){session.clear();showLogin();return@runOnUiThread}
                if(r.code !in 200..299){content.addView(title(api.errorMessage(r),15f));return@runOnUiThread}
                try{
                    val a=JSONArray(r.body)
                    if(a.length()==0)content.addView(title("Nenhum item encontrado.",16f))
                    for(i in 0 until a.length()){
                        val o=a.getJSONObject(i);val row=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,8,0,8)}
                        row.addView(title(o.optString("name",o.optString("id")),17f))
                        row.addView(title(o.optString("document_type",kind),13f))
                        if(kind=="document"||kind=="trash"){
                            val actions=LinearLayout(this)
                            if(kind=="document")actions.addView(btn("Excluir"){Thread{api.deleteDocument(o.optString("id"));runOnUiThread{load("Docs")}}.start()})
                            if(kind=="trash"){actions.addView(btn("Restaurar"){Thread{api.restoreDocument(o.optString("id"));runOnUiThread{load("Lixeira")}}.start()});actions.addView(btn("Excluir definitivamente"){Thread{api.permanentDelete(o.optString("id"));runOnUiThread{load("Lixeira")}}.start()})}
                            row.addView(actions)
                        }
                        content.addView(row)
                    }
                }catch(_:Exception){content.addView(title(r.body,13f))}
                if(kind=="document"){content.addView(btn("Novo documento"){createDocumentDialog()})}
                if(kind=="folder"){content.addView(btn("Nova pasta"){createFolderDialog()})}
            }
        }.start()
    }

    private fun searchPanel(){
        val q=field("Pesquisar documentos");content.addView(q);content.addView(btn("Buscar"){Thread{
            val r=api.search(q.text.toString())
            runOnUiThread{
                content.addView(title(if(r.code in 200..299)try{JSONObject(r.body).optJSONArray("items")?.toString()?:r.body}catch(_:Exception){r.body}else api.errorMessage(r),14f))
            }
        }.start()})
    }

    private fun createDocumentDialog(){
        val name=field("Nome");val body=field("Conteúdo");val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;addView(name);addView(body)}
        AlertDialog.Builder(this).setTitle("Novo documento").setView(box).setNegativeButton("Cancelar",null).setPositiveButton("Criar"){_,_->Thread{
            val r=api.createDocument(name.text.toString(),"text",body.text.toString())
            runOnUiThread{Toast.makeText(this,if(r.code in 200..299)"Documento criado" else api.errorMessage(r),Toast.LENGTH_SHORT).show();load("Docs")}
        }.start()}.show()
    }

    private fun createFolderDialog(){
        val name=field("Nome da pasta");AlertDialog.Builder(this).setTitle("Nova pasta").setView(name).setNegativeButton("Cancelar",null).setPositiveButton("Criar"){_,_->Thread{
            val r=api.createFolder(name.text.toString());runOnUiThread{Toast.makeText(this,if(r.code in 200..299)"Pasta criada" else api.errorMessage(r),Toast.LENGTH_SHORT).show();load("Pastas")}
        }.start()}.show()
    }

    private fun byosPanel(){
        content.addView(title("BYOS — Bring Your Own Storage",23f))
        content.addView(title("O KZ Documents não hospeda seus arquivos. Escolha uma pasta no aparelho ou em um provedor apresentado pelo seletor Android.",15f))
        content.addView(title("Armazenamento: "+storage.label(),14f))
        content.addView(btn("Escolher armazenamento"){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),treeRequest)})
        content.addView(btn("Testar escrita"){Thread{
            val ok=storage.createTextFile("KZ-Documents-test.txt","Arquivo criado pelo KZ Documents.")
            runOnUiThread{Toast.makeText(this,if(ok)"Arquivo criado" else "Escolha um armazenamento primeiro",Toast.LENGTH_SHORT).show()}
        }.start()})
        content.addView(btn("Desconectar armazenamento"){storage.clearTree();load("BYOS")})
    }

    private fun accountPanel(){
        content.addView(title("Conta",23f));content.addView(btn("Atualizar perfil"){Thread{
            val r=api.me();runOnUiThread{content.addView(title(r.body,13f))}
        }.start()})
        content.addView(btn("Sair"){Thread{api.logout();session.clear();runOnUiThread{showLogin()}}.start()})
        content.addView(title("Versão instalada: "+BuildConfig.VERSION_NAME,14f))
    }

    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==treeRequest&&resultCode==Activity.RESULT_OK)data?.data?.let{storage.rememberTree(it);load("BYOS")}
    }
}
