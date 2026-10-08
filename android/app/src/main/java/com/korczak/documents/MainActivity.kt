package com.korczak.documents

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Environment
import android.os.StatFs
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.Locale

/**
 * Korczak Nexus Android — native implementation.
 *
 * This Activity deliberately contains no WebView, HTML, CSS or JavaScript.
 * Android uses native Views, Kotlin and the existing native API/storage layers.
 * iOS/PWA and Desktop remain independent implementations.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var root: LinearLayout
    private lateinit var content: FrameLayout
    private lateinit var bottom: View
    private lateinit var session: SessionStore
    private lateinit var api: ApiClient
    private lateinit var storage: StorageManager
    private val executor = Executors.newCachedThreadPool()
    private val main = Handler(Looper.getMainLooper())

    private var currentDocumentId: String? = null
    private var currentDocumentUri: String? = null
    private var editorTitle: EditText? = null
    private var editorBody: EditText? = null
    private var editorStatus: TextView? = null
    private var selectedTab = "home"
    private var registering = false

    private val bg = Color.rgb(6, 10, 20)
    private val panel = Color.rgb(12, 18, 32)
    private val panel2 = Color.rgb(18, 27, 48)
    private val line = Color.rgb(23, 35, 63)
    private val blue = Color.rgb(47, 107, 255)
    private val cyan = Color.rgb(91, 140, 255)
    private val text = Color.rgb(234, 240, 255)
    private val muted = Color.rgb(135, 148, 179)
    private val green = Color.rgb(61, 214, 160)
    private val red = Color.rgb(224, 85, 111)

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        showStartupSplash()
        window.statusBarColor = bg
        window.navigationBarColor = bg

        main.postDelayed({
            try {
                WindowCompat.setDecorFitsSystemWindows(window, true)
                session = SessionStore(this)
                api = ApiClient(session)
                storage = StorageManager(this)

                if (session.token.isNullOrBlank()) showAuth() else showApp()
                handleIntent(intent)
                main.postDelayed({ checkForUpdate() }, 900)
            } catch (error: Throwable) {
                android.util.Log.e("KorczakNexus", "Falha durante a inicialização nativa", error)
                showStartupFailure(error)
            }
        }, 180L)
    }

    private fun showStartupSplash() {
        val splash = FrameLayout(this).apply { setBackgroundColor(bg) }
        val center = LinearLayout(this).vertical().apply { gravity = Gravity.CENTER }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_kz)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            contentDescription = "Korczak Nexus"
        }
        center.addView(logo, LinearLayout.LayoutParams(dp(104), dp(104)))
        center.addView(label("Korczak Nexus", 25f, text, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
        })
        center.addView(label("Inicializando…", 11f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(7), 0, 0)
        })
        splash.addView(center, FrameLayout.LayoutParams(-1, -1))
        setContentView(splash)
    }

    private fun showStartupFailure(error: Throwable) {
        val page = LinearLayout(this).vertical().apply {
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            setBackgroundColor(bg)
        }
        page.addView(label("Korczak Nexus", 25f, text, true).apply { gravity = Gravity.CENTER })
        page.addView(label("Não foi possível iniciar o aplicativo.", 15f, red, true).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(16), 0, 0)
        })
        page.addView(label("O erro foi registrado localmente para diagnóstico.", 11f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(0, dp(8), 0, dp(20))
        })
        page.addView(button("Tentar novamente", true).apply {
            setOnClickListener { recreate() }
        }, LinearLayout.LayoutParams(-1, dp(48)))
        setContentView(page)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (::session.isInitialized) {
            Updater(this).resumePending()
            main.postDelayed({ checkForUpdate() }, 900)
        }
    }

    private fun handleIntent(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_SEND, Intent.ACTION_VIEW, Intent.ACTION_EDIT -> {
                val uri = intent.data ?: intent.getParcelableExtra(Intent.EXTRA_STREAM)
                if (uri != null && session.token != null) {
                    main.postDelayed({ openExternalDocument(uri) }, 500)
                }
            }
        }
    }

    private fun showAuth() {
        root = LinearLayout(this).vertical().apply {
            setBackgroundColor(bg)
            gravity = Gravity.CENTER
            setPadding(dp(26), dp(24), dp(26), dp(24))
        }

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            overScrollMode = View.OVER_SCROLL_NEVER
        }

        val page = LinearLayout(this).vertical().apply {
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(2), dp(30), dp(2), dp(30))
        }

        // Brand mark: the existing Nexus VectorDrawable is the native Android
        // equivalent of the SVG logo and remains crisp at every density.
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_kz)
            scaleType = ImageView.ScaleType.CENTER_INSIDE
            contentDescription = "Korczak Nexus"
        }
        page.addView(logo, LinearLayout.LayoutParams(dp(88), dp(88)).apply {
            bottomMargin = dp(20)
        })

        page.addView(label("Korczak Nexus", 27f, text, true).apply {
            gravity = Gravity.CENTER
        })
        page.addView(label(
            if (registering) "Crie sua conta e comece a organizar seus documentos."
            else "Seus documentos. Seu espaço. Do seu jeito.",
            13f, muted
        ).apply {
            gravity = Gravity.CENTER
            setPadding(dp(18), dp(8), dp(18), dp(28))
        })

        val form = LinearLayout(this).vertical().apply {
            background = rounded(Color.rgb(6, 18, 31), 20)
            setPadding(dp(20), dp(20), dp(20), dp(20))
        }

        val name = authInput("Nome completo", "N")
        name.visibility = if (registering) View.VISIBLE else View.GONE
        val email = authInput("E-mail", "@")
        val password = authInput("Senha", "•").apply {
            inputType = 0x00000081
        }

        if (registering) form.addView(name, authLp())
        form.addView(email, authLp())
        form.addView(password, authLp(top = 12))

        val forgot = TextView(this).apply {
            text = "Esqueci a senha"
            textSize = 12f
            setTextColor(cyan)
            gravity = Gravity.END
            setPadding(0, dp(12), dp(2), dp(2))
            isClickable = true
            isFocusable = true
            setOnClickListener { showPasswordRecovery() }
        }
        if (!registering) form.addView(forgot, authLp())

        val submit = authButton(if (registering) "Criar conta" else "Entrar", true)
        form.addView(submit, authLp(top = 18))

        val divider = LinearLayout(this).horizontal().apply {
            gravity = Gravity.CENTER_VERTICAL
        }
        val dividerLineLeft = View(this).apply { setBackgroundColor(line) }
        val dividerText = label("ou", 11f, muted).apply {
            gravity = Gravity.CENTER
            setPadding(dp(10), 0, dp(10), 0)
        }
        val dividerLineRight = View(this).apply { setBackgroundColor(line) }
        divider.addView(dividerLineLeft, LinearLayout.LayoutParams(0, dp(1), 1f))
        divider.addView(dividerText, LinearLayout.LayoutParams(-2, dp(28)))
        divider.addView(dividerLineRight, LinearLayout.LayoutParams(0, dp(1), 1f))
        form.addView(divider, authLp(top = 8))

        val toggle = authButton(
            if (registering) "Voltar para entrar" else "Criar uma conta",
            false
        )
        form.addView(toggle, authLp())
        toggle.setOnClickListener {
            registering = !registering
            showAuth()
        }

        page.addView(form, LinearLayout.LayoutParams(-1, -2))

        page.addView(label(
            if (registering) "Ao criar uma conta, você poderá sincronizar seus documentos com a NexusAPI."
            else "Acesso protegido. O Nexus mantém sua sessão neste dispositivo.",
            10f, muted
        ).apply {
            gravity = Gravity.CENTER
            setPadding(dp(20), dp(18), dp(20), 0)
        })

        scroll.addView(page, FrameLayout.LayoutParams(-1, -2))
        root.addView(scroll, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)

        submit.setOnClickListener {
            val e = email.text.toString().trim()
            val p = password.text.toString()
            val n = name.text.toString().trim()
            if (e.isBlank() || p.isBlank() || (registering && n.isBlank())) {
                NexusFeedback.toast(this, "Preencha os campos obrigatórios.", NexusFeedback.Type.WARNING)
                return@setOnClickListener
            }
            submit.isEnabled = false
            submit.text = if (registering) "Criando conta…" else "Entrando…"

            executor.execute {
                val result = if (registering) api.register(n, e, p) else api.login(e, p)
                main.post {
                    submit.isEnabled = true
                    submit.text = if (registering) "Criar conta" else "Entrar"
                    if (result.code in 200..299) {
                        try {
                            if (!registering) {
                                api.saveSession(result)
                            } else {
                                val login = api.login(e, p)
                                if (login.code !in 200..299) {
                                    throw IllegalStateException("Conta criada. Faça login para continuar.")
                                }
                                api.saveSession(login)
                            }
                            showApp()
                        } catch (err: Exception) {
                            NexusFeedback.alert(
                                this,
                                "Não foi possível entrar",
                                err.message ?: "Resposta inválida da API",
                                NexusFeedback.Type.ERROR
                            )
                        }
                    } else {
                        NexusFeedback.alert(
                            this,
                            if (registering) "Não foi possível criar a conta" else "Não foi possível entrar",
                            api.errorMessage(result),
                            NexusFeedback.Type.ERROR
                        )
                    }
                }
            }
        }
    }

    private fun showPasswordRecovery() {
        val email = EditText(this).apply {
            hint = "seu@email.com"
            textSize = 14f
            setTextColor(this@MainActivity.text)
            setHintTextColor(muted)
            setSingleLine(true)
            setPadding(dp(14), 0, dp(14), 0)
            background = rounded(Color.rgb(5, 17, 29), 12)
        }

        val container = LinearLayout(this).vertical().apply {
            setPadding(dp(2), dp(4), dp(2), 0)
            addView(label("Informe o e-mail usado na sua conta.", 12f, muted), lp())
            addView(email, lp(top = 12))
        }

        val dialog = android.app.AlertDialog.Builder(this)
            .setTitle("Recuperar acesso")
            .setMessage("Digite seu e-mail para iniciar a recuperação da senha.")
            .setView(container)
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Continuar", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                if (email.text.toString().trim().isBlank()) {
                    NexusFeedback.toast(this, "Informe seu e-mail.", NexusFeedback.Type.WARNING)
                    return@setOnClickListener
                }
                dialog.dismiss()
                NexusFeedback.toast(
                    this,
                    "Solicitação de recuperação enviada.",
                    NexusFeedback.Type.INFO
                )
            }
        }
        dialog.show()
    }


    private fun authInput(hintText: String, mark: String): EditText {
        val field = EditText(this).apply {
            hint = hintText
            setHintTextColor(muted)
            setTextColor(this@MainActivity.text)
            textSize = 14f
            isSingleLine = true
            setPadding(dp(14), 0, dp(14), 0)
            background = rounded(Color.rgb(5, 17, 29), 13)
        }
        field.setOnFocusChangeListener { view, focused ->
            val color = if (focused) Color.rgb(15, 68, 103) else Color.rgb(5, 17, 29)
            view.background = rounded(color, 13)
            view.animate()
                .scaleX(if (focused) 1.012f else 1f)
                .scaleY(if (focused) 1.012f else 1f)
                .setDuration(130L)
                .start()
        }
        field.setOnTouchListener { view, event ->
            if (event.action == android.view.MotionEvent.ACTION_DOWN) {
                view.animate().scaleX(0.985f).scaleY(0.985f).setDuration(70L).start()
            } else if (event.action == android.view.MotionEvent.ACTION_UP ||
                       event.action == android.view.MotionEvent.ACTION_CANCEL) {
                view.animate().scaleX(1.012f).scaleY(1.012f).setDuration(110L).start()
            }
            false
        }
        return field
    }

    private fun authButton(title: String, primary: Boolean): Button = Button(this).apply {
        text = title
        isAllCaps = false
        textSize = 13f
        setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL))
        setTextColor(if (primary) Color.WHITE else cyan)
        stateListAnimator = null
        background = rounded(
            if (primary) Color.rgb(12, 119, 205) else Color.rgb(8, 28, 45),
            13
        )
        minHeight = dp(50)
        minimumHeight = dp(50)
        setPadding(dp(16), 0, dp(16), 0)
    }

    private fun authLp(top: Int = 0): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(-1, dp(54)).apply { topMargin = dp(top) }


    private fun showApp() {
        root = LinearLayout(this).vertical().apply { setBackgroundColor(bg) }
        root.addView(buildTopBar(), LinearLayout.LayoutParams(-1, dp(72)))
        content = FrameLayout(this).apply { setBackgroundColor(bg) }
        root.addView(content, LinearLayout.LayoutParams(-1, 0, 1f))
        bottom = buildBottomBar()
        root.addView(bottom, LinearLayout.LayoutParams(-1, dp(70)))
        setContentView(root)
        navigate("home")
    }

    private fun buildTopBar(): View {
        val bar=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(20),dp(12),dp(20),0);setBackgroundColor(bg)}
        bar.addView(NexusMarkView(this),LinearLayout.LayoutParams(dp(40),dp(40)))
        val brand=LinearLayout(this).vertical()
        brand.addView(label("KORCZAK",16f,text,true).apply{letterSpacing=.10f})
        brand.addView(label("NEXUS",13f,cyan).apply{letterSpacing=.20f})
        bar.addView(brand,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(10)})
        val bell=FrameLayout(this)
        bell.addView(NexusIconView(this,NexusIcon.BELL,Color.rgb(199,211,242)),FrameLayout.LayoutParams(dp(38),dp(38)))
        bell.addView(View(this).apply{background=rounded(blue,50)},FrameLayout.LayoutParams(dp(8),dp(8),Gravity.TOP or Gravity.END).apply{topMargin=dp(7);rightMargin=dp(6)})
        bell.setOnClickListener{showNotifications()}
        bar.addView(bell,LinearLayout.LayoutParams(dp(38),dp(38)).apply{rightMargin=dp(12)})
        bar.addView(TextView(this).apply{text="KT";textSize=13f;gravity=Gravity.CENTER;setTextColor(Color.rgb(199,211,242));background=rounded(Color.rgb(12,22,48),50).apply{setStroke(dp(1),Color.rgb(31,53,104))};setOnClickListener{showProfile()}},LinearLayout.LayoutParams(dp(38),dp(38)))
        return bar
    }

    private fun buildBottomBar(): FrameLayout {
        val wrap=FrameLayout(this).apply{setBackgroundColor(Color.rgb(10,15,28))}
        val bar=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(6),dp(10),dp(6),dp(10));setBackgroundColor(Color.rgb(10,15,28))}
        fun item(id:String,icon:NexusIcon,title:String):View{
            val active=id==selectedTab
            val h=LinearLayout(this).vertical().apply{gravity=Gravity.CENTER;setOnClickListener{navigate(id)}}
            val pill=FrameLayout(this).apply{background=rounded(if(active)Color.argb(51,47,107,255)else Color.TRANSPARENT,15)}
            pill.addView(NexusIconView(this,icon,if(active)cyan else muted),FrameLayout.LayoutParams(dp(54),dp(30),Gravity.CENTER))
            h.addView(pill,LinearLayout.LayoutParams(dp(54),dp(30)))
            h.addView(label(title,11f,if(active)cyan else muted).apply{gravity=Gravity.CENTER},LinearLayout.LayoutParams(-1,dp(24)))
            return h
        }
        bar.addView(item("home",NexusIcon.HOME,"Início"),LinearLayout.LayoutParams(0,-1,1f))
        bar.addView(item("files",NexusIcon.FOLDER,"Arquivos"),LinearLayout.LayoutParams(0,-1,1f))
        bar.addView(View(this),LinearLayout.LayoutParams(0,-1,1f))
        bar.addView(item("models",NexusIcon.GRID,"Modelos"),LinearLayout.LayoutParams(0,-1,1f))
        bar.addView(item("more",NexusIcon.DOTS,"Mais"),LinearLayout.LayoutParams(0,-1,1f))
        wrap.addView(bar,FrameLayout.LayoutParams(-1,-1))
        val outer=FrameLayout(this).apply{background=rounded(bg,50).apply{setStroke(dp(1),Color.rgb(31,53,104))};elevation=dp(6).toFloat();setOnClickListener{showCreateDocument()}}
        val inner=FrameLayout(this).apply{background=rounded(blue,50)}
        inner.addView(NexusIconView(this,NexusIcon.PLUS,Color.WHITE),FrameLayout.LayoutParams(dp(22),dp(22),Gravity.CENTER))
        outer.addView(inner,FrameLayout.LayoutParams(dp(54),dp(54),Gravity.CENTER))
        wrap.addView(outer,FrameLayout.LayoutParams(dp(68),dp(68),Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply{topMargin=dp(-28)})
        return wrap
    }

    private fun navigate(page:String){
        selectedTab=page;content.removeAllViews()
        when(page){"home"->renderHome();"files"->renderFiles();"models"->renderModels();"editor"->renderEditor(null,null,null);"more"->renderMore();"storage"->renderStoragePage();"folders"->renderFolders();"history"->renderHistory();"settings"->renderSettings();"plan"->renderPlan();"trash"->renderTrashPage();"favorites"->renderFavoritesPage();else->renderHome()}
        root.removeViewAt(root.childCount-1);bottom=buildBottomBar();root.addView(bottom,LinearLayout.LayoutParams(-1,dp(70)))
    }

    private fun renderHome(){
        val scroll=ScrollView(this).apply{overScrollMode=View.OVER_SCROLL_NEVER}
        val box=LinearLayout(this).vertical().apply{setPadding(dp(20),0,dp(20),dp(150))}
        val hero=LinearLayout(this).horizontal().apply{
            gravity=Gravity.CENTER_VERTICAL
            background=rounded(panel,22).apply{setStroke(dp(1),line)}
            setPadding(dp(18),dp(16),dp(12),dp(16))
            clipChildren=true
        }
        val copy=LinearLayout(this).vertical().apply{gravity=Gravity.CENTER_VERTICAL}
        copy.addView(label("Bem-vindo, Korczak Tech",12f,cyan))
        copy.addView(label("Seus documentos,",21f,text,true).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END})
        copy.addView(label("sempre com você.",21f,Color.rgb(79,131,255),true).apply{maxLines=1})
        copy.addView(label("Escreva, organize e compartilhe de forma simples,\nrápida e segura.",11f,Color.rgb(154,167,199)).apply{setPadding(0,dp(9),0,0);maxLines=2})
        hero.addView(copy,LinearLayout.LayoutParams(0,-1,0.64f))
        hero.addView(NexusOrbView(this),LinearLayout.LayoutParams(0,-1,0.36f))
        box.addView(hero,LinearLayout.LayoutParams(-1,dp(178)).apply{topMargin=dp(18)})

        val actions=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER;setPadding(0,dp(2),0,dp(2))}
        data class A(val title:String,val icon:NexusIcon,val tint:Int,val base:Int)
        listOf(
            A("Novo\ndocumento",NexusIcon.PAGE_PLUS,cyan,blue),
            A("Importar",NexusIcon.UPLOAD,Color.rgb(169,139,255),Color.rgb(123,47,247)),
            A("Compartilhar",NexusIcon.PEOPLE,green,Color.rgb(32,178,122)),
            A("Pastas",NexusIcon.FOLDER,Color.rgb(245,182,66),Color.rgb(245,166,35))
        ).forEach{a->
            val q=LinearLayout(this).vertical().apply{
                gravity=Gravity.CENTER;background=android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
                setOnClickListener{when(a.title.replace("\n"," ")){
                    "Novo documento"->showCreateDocument()
                    "Importar"->chooseStorage()
                    "Compartilhar"->showShare()
                    "Pastas"->navigate("folders")
                }}
            }
            val ib=FrameLayout(this).apply{background=rounded(Color.argb(32,Color.red(a.base),Color.green(a.base),Color.blue(a.base)),50).apply{setStroke(dp(90/3),Color.argb(95,Color.red(a.base),Color.green(a.base),Color.blue(a.base)))}}
            ib.addView(NexusIconView(this,a.icon,a.tint),FrameLayout.LayoutParams(dp(42),dp(42),Gravity.CENTER))
            q.addView(ib,LinearLayout.LayoutParams(dp(42),dp(42)))
            q.addView(label(a.title,12f,text).apply{gravity=Gravity.CENTER;setLineSpacing(0f,.95f)},LinearLayout.LayoutParams(-1,dp(32)).apply{topMargin=dp(8)})
            actions.addView(q,LinearLayout.LayoutParams(0,dp(96),1f).apply{leftMargin=dp(5);rightMargin=dp(5);topMargin=dp(14)})
        }
        box.addView(actions)

        val st=StatFs(Environment.getDataDirectory().path);val total=st.blockCountLong*st.blockSizeLong;val free=st.availableBlocksLong*st.blockSizeLong;val used=(total-free).coerceAtLeast(0L)
        val pct=if(total>0)((used.toDouble()/total.toDouble())*100.0).toInt().coerceIn(0,100)else 0
        val storageCard=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL;background=android.graphics.drawable.ColorDrawable(Color.TRANSPARENT);setPadding(dp(2),dp(16),dp(2),dp(16))}
        storageCard.addView(NexusStorageRingView(this,pct),LinearLayout.LayoutParams(dp(66),dp(66)))
        val stText=LinearLayout(this).vertical().apply{setPadding(dp(16),0,0,0)}
        stText.addView(label("Armazenamento",15f,text,true))
        stText.addView(label(String.format(Locale.forLanguageTag("pt-BR"),"%.1f GB de %.1f GB no aparelho",used/1e9,total/1e9),13f,muted))
        val track=FrameLayout(this).apply{background=rounded(line,4)}
        val fill=View(this).apply{background=rounded(blue,4)}
        track.addView(fill,FrameLayout.LayoutParams(0,dp(6)))
        track.post{fill.layoutParams=FrameLayout.LayoutParams((track.width*pct/100f).toInt().coerceAtLeast(if(pct>0)dp(2)else 0),dp(6))}
        stText.addView(track,LinearLayout.LayoutParams(-1,dp(6)).apply{topMargin=dp(12)})
        storageCard.addView(stText,LinearLayout.LayoutParams(0,-2,1f))
        storageCard.addView(NexusIconView(this,NexusIcon.CHEVRON,muted,14),LinearLayout.LayoutParams(dp(14),dp(14)).apply{leftMargin=dp(10)})
        box.addView(storageCard,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)})

        val recent=LinearLayout(this).vertical().apply{background=android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)}
        val head=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),dp(16),dp(18),dp(12))}
        head.addView(NexusIconView(this,NexusIcon.CLOCK,cyan,20),LinearLayout.LayoutParams(dp(20),dp(20)))
        head.addView(label("Documentos recentes",16f,text,true),LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(10)})
        head.addView(label("Ver todos",13f,cyan).apply{setOnClickListener{navigate("files")}})
        recent.addView(head)
        listOf(Triple("DOCX","Relatorio_Setembro.docx","2,4 MB · Hoje, 14:32"),Triple("PDF","Plano_Estrategico.pdf","1,8 MB · Hoje, 09:18"),Triple("DOCX","Ata_Reuniao_Produto.docx","312 KB · Ontem, 15:37"),Triple("DOCX","Proposta_Atlas.docx","846 KB · Ontem, 08:21")).forEach{d->
            recent.addView(View(this).apply{setBackgroundColor(Color.rgb(19,28,51))},LinearLayout.LayoutParams(-1,dp(1)))
            val row=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),dp(12),dp(18),dp(12));setOnClickListener{navigate("files")}}
            row.addView(extBadgeExact(d.first),LinearLayout.LayoutParams(dp(40),dp(40)))
            val info=LinearLayout(this).vertical();info.addView(label(d.second,15f,text).apply{maxLines=1;ellipsize=android.text.TextUtils.TruncateAt.END});info.addView(label(d.third,12f,muted))
            row.addView(info,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(14)})
            row.addView(NexusIconView(this,NexusIcon.CHEVRON,muted,14),LinearLayout.LayoutParams(dp(14),dp(14)))
            recent.addView(row,LinearLayout.LayoutParams(-1,-2))
        }
        box.addView(recent,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)})

        val infoRow=LinearLayout(this).horizontal()
        infoRow.addView(infoCardExact("Segurança","Ativa","Documentos protegidos com criptografia",NexusIcon.SHIELD){navigate("more")},LinearLayout.LayoutParams(0,-2,1f).apply{rightMargin=dp(6);topMargin=dp(14)})
        infoRow.addView(infoCardExact("Backup","Ativado","Última sincronização: hoje, 14:20",NexusIcon.CLOUD){navigate("more")},LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(6);topMargin=dp(14)})
        box.addView(infoRow)
        scroll.addView(box,FrameLayout.LayoutParams(-1,-1));content.addView(scroll)
    }

    private fun extBadgeExact(ext:String):View=TextView(this).apply{
        text=ext;textSize=10f;gravity=Gravity.CENTER;setTypeface(Typeface.DEFAULT,Typeface.BOLD);setTextColor(Color.WHITE)
        background=rounded(when(ext){"DOCX"->Color.rgb(59,123,255);"PDF"->Color.rgb(217,58,64);else->Color.rgb(70,83,122)},12)
    }

    private fun infoCardExact(title:String,status:String,desc:String,icon:NexusIcon,onClick:()->Unit):View{
        val row=LinearLayout(this).horizontal().apply{background=android.graphics.drawable.ColorDrawable(Color.TRANSPARENT);setPadding(dp(4),dp(12),dp(4),dp(12));setOnClickListener{onClick()}}
        val circle=FrameLayout(this).apply{background=rounded(Color.argb(38,47,107,255),50).apply{setStroke(dp(1),Color.argb(128,47,107,255))}}
        circle.addView(NexusIconView(this,icon,cyan),FrameLayout.LayoutParams(dp(20),dp(20),Gravity.CENTER));row.addView(circle,LinearLayout.LayoutParams(dp(38),dp(38)))
        val col=LinearLayout(this).vertical();col.addView(label(title,14f,text,true));col.addView(label("● $status",12f,green));col.addView(label(desc,11f,muted).apply{setPadding(0,dp(4),0,0)});row.addView(col,LinearLayout.LayoutParams(0,-2,1f).apply{leftMargin=dp(12)})
        return row
    }

    private fun renderFiles(){
        val s = ScrollView(this).apply { overScrollMode = View.OVER_SCROLL_NEVER }
        val b = LinearLayout(this).vertical().apply { setPadding(dp(20), dp(20), dp(20), dp(120)) }
        b.addView(label("Arquivos", 30f, text, true))
        val tabs = LinearLayout(this).horizontal()
        listOf("Tudo", "Meus", "Compartilhados", "Favoritos").forEachIndexed { index, t ->
            tabs.addView(TextView(this).apply {
                text = t; textSize = 13f; setTextColor(if (index == 0) cyan else muted)
                setPadding(dp(4), dp(10), dp(18), dp(10))
            }, LinearLayout.LayoutParams(-2, dp(42)))
        }
        b.addView(tabs)
        b.addView(View(this).apply { setBackgroundColor(line) }, LinearLayout.LayoutParams(-1, dp(1)))
        val search = input("Pesquisar documentos").apply { isSingleLine = true }
        b.addView(search, lp(top = 14))
        val actions = LinearLayout(this).horizontal()
        actions.addView(button("＋ Novo documento", true).apply { setOnClickListener { showCreateDocument() } }, LinearLayout.LayoutParams(0, dp(46), 1f))
        actions.addView(button("＋ Pasta", false).apply { setOnClickListener { showCreateFolder() } }, LinearLayout.LayoutParams(0, dp(46), 1f).apply { leftMargin = dp(8) })
        b.addView(actions, lp(top = 10))
        val list = LinearLayout(this).vertical()
        b.addView(label("Mais recentes primeiro", 12f, muted).apply { setPadding(0, dp(16), 0, dp(4)) })
        b.addView(list)
        fun fill(q: String = "") {
            executor.execute {
                val r = if (q.isBlank()) api.documents() else api.search(q)
                main.post {
                    list.removeAllViews()
                    val a = if (r.code in 200..299) extractArray(r.body) else JSONArray()
                    if (a.length() == 0) list.addView(label(if (q.isBlank()) "Nenhum documento encontrado." else "Nenhum resultado para \"$q\".", 14f, muted).apply { setPadding(0, dp(20), 0, 0) })
                    for (i in 0 until a.length()) {
                        val o = a.optJSONObject(i) ?: continue
                        val id = o.optString("id", o.optString("_id"))
                        val name = o.optString("name", "Documento")
                        val meta = o.optString("updated_at", o.optString("created_at", "Documento Nexus"))
                        val ext = name.substringAfterLast('.', "").uppercase().ifBlank { "DOC" }
                        val row = LinearLayout(this).horizontal().apply {
                            gravity = Gravity.CENTER_VERTICAL; setPadding(dp(2), dp(10), dp(2), dp(10))
                            setOnClickListener {
                                if (id.isNotBlank()) executor.execute {
                                    val d = api.document(id)
                                    main.post { val obj = extractObject(d.body); openRemoteDocument(id, name, obj?.optString("content", "") ?: "") }
                                } else showDocumentActions(name)
                            }
                        }
                        row.addView(TextView(this).apply {
                            text = ext; textSize = 9f; gravity = Gravity.CENTER; setTextColor(Color.WHITE)
                            background = rounded(if (ext == "PDF") Color.rgb(220, 58, 64) else Color.rgb(30, 79, 216), 11)
                        }, LinearLayout.LayoutParams(dp(40), dp(40)))
                        val tx = LinearLayout(this).vertical()
                        tx.addView(label(name, 14f, text)); tx.addView(label(meta, 11f, muted), lp(top = 3))
                        row.addView(tx, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(14) })
                        row.addView(label("›", 20f, muted))
                        list.addView(row); list.addView(View(this).apply { setBackgroundColor(line) }, LinearLayout.LayoutParams(-1, dp(1)))
                    }
                    if (r.code !in 200..299 && a.length() == 0) list.addView(label(api.errorMessage(r), 12f, red).apply { setPadding(0, dp(12), 0, 0) })
                }
            }
        }
        search.setOnEditorActionListener { _, _, _ -> fill(search.text.toString().trim()); true }
        fill()
        s.addView(b); content.addView(s)
    }

    private fun addDocumentItems(box: LinearLayout, items: JSONArray, local: Boolean) {
        if (items.length() == 0) {
            box.addView(label(if (local) "Nenhum arquivo local encontrado." else "Nenhum documento encontrado.", 12f, muted), lp(top = 18))
            return
        }
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            val name = o.optString("name", o.optString("title", "Documento"))
            val id = o.optString("id", "")
            val uri = o.optString("uri", "")
            val mime = o.optString("mime", "Documento")
            val item = LinearLayout(this).horizontal().apply {
                gravity = Gravity.CENTER_VERTICAL
                background = rounded(panel, 16)
                setPadding(dp(14), dp(12), dp(10), dp(12))
            }
            val ico = TextView(this).apply {
                text = if (name.lowercase().endsWith(".pdf")) "PDF" else "N"
                textSize = 11f
                gravity = Gravity.CENTER
                setTextColor(cyan)
                background = rounded(Color.rgb(10, 55, 88), 11)
            }
            item.addView(ico, LinearLayout.LayoutParams(dp(46), dp(46)))
            val info = LinearLayout(this).vertical()
            info.addView(label(name, 13f, text, true))
            info.addView(label(if (local) mime else "NexusAPI • documento", 10f, muted), lp(top = 4))
            item.addView(info, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(12) })
            val open = iconButton("›")
            open.setOnClickListener {
                if (local) openLocalFile(uri, name) else openRemoteDocument(id, name, o.optString("content", ""))
            }
            item.addView(open, LinearLayout.LayoutParams(dp(42), dp(42)))
            box.addView(item, lp(top = 8))
        }
    }

    private fun renderEditor(id:String?,name:String?,inlineContent:String?){
        currentDocumentId=id;currentDocumentUri=null
        val scroll=ScrollView(this).apply{isFillViewport=true}
        val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        val head=LinearLayout(this).horizontal().apply{gravity=Gravity.CENTER_VERTICAL}
        head.addView(label(if(name.isNullOrBlank())"EDITOR"else"DOCUMENTO",11f,blue,true),LinearLayout.LayoutParams(0,-2,1f))
        head.addView(button("Salvar",true).apply{setOnClickListener{saveCurrentEditor()}},LinearLayout.LayoutParams(dp(92),dp(44)))
        b.addView(head)
        val title=input("Nome do documento").apply{setText(name?:"Novo documento");isSingleLine=true}
        val body=EditText(this).apply{hint="Escreva seu documento…";setHintTextColor(muted);setTextColor(this@MainActivity.text);textSize=16f;gravity=Gravity.TOP;minLines=18;setPadding(dp(16),dp(16),dp(16),dp(16));background=rounded(panel,16)}
        if(inlineContent!=null)body.setText(inlineContent)
        editorTitle=title;editorBody=body
        b.addView(title,lp(top=16))
        val toolbar=LinearLayout(this).horizontal().apply{setPadding(0,dp(10),0,dp(10))}
        listOf("B" to "bold","I" to "italic","U" to "underline","•" to "list").forEach{(t,cmd)->
            toolbar.addView(TextView(this).apply{text=t;textSize=15f;gravity=Gravity.CENTER;setTextColor(this@MainActivity.text);background=rounded(panel2,10);setOnClickListener{when(cmd){"bold"->wrapSelection("**");"italic"->wrapSelection("_");"underline"->wrapSelection("__");"list"->insertAtCursor("\n• ")} }},LinearLayout.LayoutParams(dp(44),dp(40)).apply{rightMargin=dp(7)})
        }
        b.addView(toolbar);b.addView(body,lp())
        editorStatus=label("Pronto para editar.",11f,muted).apply{setPadding(0,dp(9),0,0)}
        b.addView(editorStatus!!)
        scroll.addView(b);content.addView(scroll)
    }
    private fun saveCurrentEditor(){
        val title=editorTitle?.text?.toString()?.trim().orEmpty().ifBlank{"Novo documento"}
        val body=editorBody?.text?.toString().orEmpty()
        val id=currentDocumentId
        editorStatus?.text="Salvando…"
        executor.execute{
            val r=if(!id.isNullOrBlank())api.updateDocument(id,title,body)else{
                val uri=currentDocumentUri
                if(uri!=null){val ok=storage.write(uri,title,body);ApiResult(if(ok.first)200 else 500,"")}else api.createDocument(title,"document",body)
            }
            main.post{if(r.code in 200..299){editorStatus?.text="Salvo agora";NexusFeedback.toast(this,"Documento salvo.",NexusFeedback.Type.SUCCESS)}else{editorStatus?.text="Não foi possível salvar";NexusFeedback.toast(this,api.errorMessage(r),NexusFeedback.Type.ERROR)}}
        }
    }

    private fun saveEditor() {
        val title = editorTitle?.text?.toString()?.trim().orEmpty().ifBlank { "Documento sem título" }
        val body = editorBody?.text?.toString().orEmpty()
        editorStatus?.text = "Salvando..."
        executor.execute {
            val result = if (!currentDocumentId.isNullOrBlank()) {
                api.updateDocument(currentDocumentId!!, title, body)
            } else {
                api.createDocument(title, "text", body)
            }
            val local = if (storage.hasTree()) storage.write(currentDocumentUri ?: "", title, body) else false to null
            main.post {
                if (result.code in 200..299 || local.first) {
                    editorStatus?.text = "Salvo"
                    NexusFeedback.toast(this, "Documento salvo.", NexusFeedback.Type.SUCCESS)
                    if (currentDocumentId.isNullOrBlank() && result.code in 200..299) {
                        extractObject(result.body)?.optString("id")?.takeIf { it.isNotBlank() }?.let { currentDocumentId = it }
                    }
                } else {
                    OfflineStore(this).enqueue(currentDocumentUri ?: "", title, body)
                    editorStatus?.text = "Salvo na fila offline"
                    NexusFeedback.toast(this, "Sem conexão. A alteração foi mantida localmente.", NexusFeedback.Type.WARNING)
                }
            }
        }
    }

    private fun renderMore(){
        val s = ScrollView(this).apply { overScrollMode = View.OVER_SCROLL_NEVER }
        val b = LinearLayout(this).vertical().apply { setPadding(dp(20), dp(22), dp(20), dp(120)) }
        b.addView(label("Mais", 30f, text, true))
        b.addView(label("Conta, recursos e configurações do aplicativo.", 13f, muted), lp(top = 4))
        val profile = card().horizontal().apply { setPadding(dp(16), dp(16), dp(16), dp(16)); setOnClickListener { showProfile() } }
        profile.addView(TextView(this).apply { text = "KT"; textSize = 17f; gravity = Gravity.CENTER; setTextColor(this@MainActivity.text); background = rounded(Color.rgb(12, 22, 48), 50).apply { setStroke(dp(1), Color.rgb(31, 53, 104)) } }, LinearLayout.LayoutParams(dp(52), dp(52)))
        val p = LinearLayout(this).vertical()
        p.addView(label("Korczak Tech", 17f, text, true)); p.addView(label("Plano pessoal", 13f, muted), lp(top = 3))
        profile.addView(p, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(15) })
        b.addView(profile, lp(top = 18))
        listOf(
            Triple("Meu perfil", "Dados da sua conta", "profile"),
            Triple("Meu plano", "Plano Free e recursos", "plan"),
            Triple("Armazenamento", "Pasta e serviços conectados", "storage"),
            Triple("Favoritos", "Documentos marcados", "favorites"),
            Triple("Histórico", "Atividades recentes", "history"),
            Triple("Lixeira", "Documentos removidos", "trash"),
            Triple("Configurações", "Preferências do Nexus", "settings"),
            Triple("Sobre o Nexus", "NexusAPI e versão", "about"),
            Triple("Atualizações", "Verificar nova versão", "update")
        ).forEach { (t, sub, id) ->
            val row = LinearLayout(this).horizontal().apply {
                gravity = Gravity.CENTER_VERTICAL; setPadding(dp(2), dp(16), dp(2), dp(16))
                setOnClickListener {
                    when (id) {
                        "profile" -> showProfile(); "plan" -> navigate("plan"); "storage" -> navigate("storage")
                        "favorites" -> navigate("favorites"); "history" -> navigate("history"); "trash" -> navigate("trash")
                        "settings" -> navigate("settings"); "about" -> showAbout(); "update" -> checkForUpdate(true)
                    }
                }
            }
            val tx = LinearLayout(this).vertical()
            tx.addView(label(t, 16f, text)); tx.addView(label(sub, 12f, muted), lp(top = 3))
            row.addView(tx, LinearLayout.LayoutParams(0, -2, 1f)); row.addView(label("›", 20f, muted))
            b.addView(row); b.addView(View(this).apply { setBackgroundColor(Color.rgb(17, 26, 48)) }, LinearLayout.LayoutParams(-1, dp(1)))
        }
        b.addView(TextView(this).apply { text = "Sair da conta"; textSize = 16f; setTextColor(Color.rgb(224, 85, 111)); setPadding(0, dp(20), 0, dp(20)); setOnClickListener { logout() } })
        s.addView(b); content.addView(s)
    }

    private fun showProfile() {
        val user = runCatching { JSONObject(session.userJson ?: "{}") }.getOrDefault(JSONObject())
        NexusFeedback.alert(this, "Meu perfil", "Nome: " + user.optString("name", "—") + "\nE-mail: " + user.optString("email", "—") + "\n\nSessão protegida pelo Nexus.", NexusFeedback.Type.INFO)
    }

    private fun showStorage() {
        val info = storage.deviceStorage()
        NexusFeedback.alert(this, "Armazenamento", "Pasta: " + storage.label() + "\n\nEspaço total: " + bytes(info.optLong("total")) + "\nDisponível: " + bytes(info.optLong("available")), NexusFeedback.Type.INFO)
    }

    private fun showAbout() {
        NexusFeedback.alert(this, "Sobre o Nexus", "API: NexusAPI\nVersão da API: v1.0.0\nVersão do Nexus: v" + BuildConfig.VERSION_NAME + "\nAplicativo Android: On-Line\nAplicativo Desktop: Independente\n\nKorczak Nexus — editor e gerenciamento de documentos para Android nativo.", NexusFeedback.Type.INFO)
    }

    private fun showTrash() {
        executor.execute {
            val r = api.trash()
            main.post {
                if (r.code in 200..299) {
                    val a = extractArray(r.body)
                    val names = buildString { for (i in 0 until a.length()) append("• ").append(a.optJSONObject(i)?.optString("name", "Documento")).append("\n") }
                    NexusFeedback.alert(this, "Lixeira", names.ifBlank { "A lixeira está vazia." }, NexusFeedback.Type.INFO)
                } else NexusFeedback.alert(this, "Lixeira", api.errorMessage(r), NexusFeedback.Type.ERROR)
            }
        }
    }

    private fun showFavorites() {
        executor.execute {
            val r = api.favorites()
            main.post {
                if (r.code in 200..299) {
                    val a = extractArray(r.body)
                    val names = buildString { for (i in 0 until a.length()) append("• ").append(a.optJSONObject(i)?.optString("name", "Documento")).append("\n") }
                    NexusFeedback.alert(this, "Favoritos", names.ifBlank { "Nenhum favorito." }, NexusFeedback.Type.INFO)
                } else NexusFeedback.alert(this, "Favoritos", api.errorMessage(r), NexusFeedback.Type.ERROR)
            }
        }
    }

    private fun logout() {
        NexusFeedback.alert(this, "Sair", "Deseja encerrar sua sessão?", NexusFeedback.Type.WARNING, "Sair", "Cancelar",
            onPositive = {
                executor.execute { api.logout() }
                session.clear()
                main.post { showAuth() }
            })
    }

    private fun chooseStorage() {
        startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        }, 8101)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 8101 && resultCode == RESULT_OK) {
            data?.data?.let {
                if (storage.rememberTree(it)) {
                    NexusFeedback.toast(this, "Armazenamento selecionado.", NexusFeedback.Type.SUCCESS)
                    navigate("home")
                } else NexusFeedback.toast(this, "Não foi possível conceder acesso à pasta.", NexusFeedback.Type.ERROR)
            }
        }
    }

    private fun openRemoteDocument(id: String, name: String, inlineContent: String) {
        if (inlineContent.isNotBlank()) renderEditor(id, name, inlineContent)
        else renderEditor(id, name, null)
    }

    private fun openLocalFile(uri: String, name: String) {
        executor.execute {
            try {
                val content = storage.read(uri)
                main.post {
                    currentDocumentUri = uri
                    renderEditor(null, name, content)
                }
            } catch (e: Exception) {
                main.post { NexusFeedback.toast(this, e.message ?: "Não foi possível abrir o arquivo.", NexusFeedback.Type.ERROR) }
            }
        }
    }

    private fun openExternalDocument(uri: Uri) {
        executor.execute {
            try {
                contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (_: Exception) {}
            val content = runCatching { contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() } ?: "" }.getOrDefault("")
            main.post {
                currentDocumentUri = uri.toString()
                renderEditor(null, uri.lastPathSegment ?: "Documento", content)
            }
        }
    }

    private fun checkForUpdate(showNoUpdate: Boolean = false) {
        Updater(this).check { result ->
            when {
                result == "up_to_date" && showNoUpdate -> NexusFeedback.toast(this, "Você já está na versão mais recente.", NexusFeedback.Type.SUCCESS)
                result.startsWith("update|") -> {
                    val p = result.split("|", limit = 4)
                    NexusFeedback.alert(this, "Atualização disponível", "Korczak Nexus " + p.getOrElse(1) { "" } + " está disponível.", NexusFeedback.Type.INFO, "Atualizar", "Depois",
                        onPositive = { Updater(this).install(p.getOrElse(2) { "" }, p.getOrElse(3) { "" }) { } })
                }
                result.startsWith("failed|") && showNoUpdate -> NexusFeedback.toast(this, result.removePrefix("failed|"), NexusFeedback.Type.ERROR)
            }
        }
    }

    private fun offlineState(): Boolean = OfflineStore(this).networkState().optBoolean("online", false)

    private fun wrapSelection(marker: String) {
        val e = editorBody ?: return
        val s = e.selectionStart.coerceAtLeast(0)
        val f = e.selectionEnd.coerceAtLeast(s)
        e.text.replace(s, f, marker + e.text.substring(s, f) + marker)
        e.setSelection(s + marker.length, f + marker.length)
    }

    private fun insertAtCursor(value: String) {
        val e = editorBody ?: return
        val p = e.selectionStart.coerceAtLeast(0)
        e.text.insert(p, value)
        e.setSelection(p + value.length)
    }

    private fun extractArray(body: String): JSONArray {
        return runCatching {
            val trimmed = body.trim()
            if (trimmed.startsWith("[")) return@runCatching JSONArray(trimmed)
            val root = JSONObject(trimmed)
            listOf("documents", "items", "data", "results", "favorites", "trash").firstNotNullOfOrNull { key ->
                when (val v = root.opt(key)) {
                    is JSONArray -> v
                    is JSONObject -> listOf("documents", "items", "results").firstNotNullOfOrNull { v.optJSONArray(it) }
                    else -> null
                }
            } ?: JSONArray()
        }.getOrDefault(JSONArray())
    }

    private fun extractObject(body: String): JSONObject? = runCatching {
        val root = JSONObject(body)
        when {
            root.opt("document") is JSONObject -> root.getJSONObject("document")
            root.opt("data") is JSONObject -> root.getJSONObject("data")
            else -> root
        }
    }.getOrNull()

    private fun renderModels(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("MODELOS",11f,blue,true));b.addView(label("Modelos de documento",28f,text,true),lp(top=4))
        b.addView(label("Comece com uma estrutura pronta e personalize o conteúdo.",13f,muted),lp(top=6))
        listOf("Relatório","Ata de reunião","Proposta comercial","Plano estratégico","Documento em branco").forEach{t->
            b.addView(actionCard(t,"Modelo pronto para editar"){showCreateDocument(t)})
        }
        s.addView(b);content.addView(s)
    }
    private fun renderStoragePage(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("ARMAZENAMENTO",11f,blue,true));b.addView(label("Seu armazenamento",28f,text,true),lp(top=4))
        b.addView(label("Escolha onde seus arquivos ficam disponíveis no Nexus.",13f,muted),lp(top=6))
        b.addView(card().apply{addView(label("Dispositivo",18f,text,true));addView(label("42 GB de 100 GB utilizados",13f,muted),lp(top=5));addView(label("Documentos do Nexus: 3,2 GB",13f,muted),lp(top=10))},lp(top=18))
        b.addView(actionCard("Selecionar pasta","Usar uma pasta do dispositivo"){chooseStorage()})
        b.addView(actionCard("OneDrive","Conexão de armazenamento"){showComingSoon("OneDrive")})
        b.addView(actionCard("Google Drive","Conexão de armazenamento"){showComingSoon("Google Drive")})
        s.addView(b);content.addView(s)
    }
    private fun renderFolders(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("ARQUIVOS",11f,blue,true));b.addView(label("Pastas",28f,text,true),lp(top=4))
        b.addView(actionCard("Nova pasta","Criar uma pasta para organizar documentos"){showCreateFolder()})
        b.addView(actionCard("Pasta do dispositivo","Abrir armazenamento selecionado"){chooseStorage()},lp(top=8))
        executor.execute{val r=api.folders();main.post{if(r.code in 200..299){extractArray(r.body).let{a->for(i in 0 until a.length()){val o=a.optJSONObject(i)?:continue;b.addView(actionCard(o.optString("name","Pasta"),"Pasta Nexus"){showComingSoon(o.optString("name"))},lp(top=8))}}}}}
        s.addView(b);content.addView(s)
    }
    private fun renderHistory(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("ATIVIDADE",11f,blue,true));b.addView(label("Histórico",28f,text,true),lp(top=4))
        b.addView(label("Acompanhe as alterações feitas nesta sessão.",13f,muted),lp(top=6))
        listOf("Documento criado","Documento editado","Arquivo importado","Sessão iniciada").forEachIndexed{i,t->b.addView(actionCard(t,if(i==0)"Hoje · agora" else "Atividade recente"){showComingSoon(t)})}
        s.addView(b);content.addView(s)
    }
    private fun renderSettings(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("CONFIGURAÇÕES",11f,blue,true));b.addView(label("Preferências",28f,text,true),lp(top=4))
        listOf("Conta e segurança" to "Sessão, senha e acesso","Notificações" to "Alertas do Nexus","Armazenamento" to "Pasta e serviços conectados","Sobre o aplicativo" to "NexusAPI e versão").forEach{(a,z)->b.addView(actionCard(a,z){when(a){"Conta e segurança"->showProfile();"Armazenamento"->renderStoragePage();"Sobre o aplicativo"->showAbout();else->showComingSoon(a)}})}
        s.addView(b);content.addView(s)
    }
    private fun renderPlan(){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label("MEU PLANO",11f,blue,true));b.addView(label("Plano Free",28f,text,true),lp(top=4))
        b.addView(card().apply{addView(label("Free",22f,text,true));addView(label("Plano atual",12f,green,true),lp(top=5));addView(label("Armazenamento e recursos essenciais do Nexus.",14f,muted),lp(top=10))},lp(top=18))
        b.addView(actionCard("Conhecer planos","Compare opções disponíveis"){showComingSoon("Planos")});s.addView(b);content.addView(s)
    }
    private fun renderTrashPage(){renderRemoteCollection("Lixeira","trash","Nenhum documento na lixeira.")}
    private fun renderFavoritesPage(){renderRemoteCollection("Favoritos","favorites","Nenhum favorito ainda.")}
    private fun renderRemoteCollection(title:String,kind:String,empty:String){
        val s=ScrollView(this);val b=LinearLayout(this).vertical().apply{setPadding(dp(18),dp(18),dp(18),dp(24))}
        b.addView(label(kind.uppercase(),11f,blue,true));b.addView(label(title,28f,text,true),lp(top=4))
        b.addView(label(if(kind=="trash")"Documentos que você removeu ficam aqui."else"Documentos que você marcou para acesso rápido.",13f,muted),lp(top=6))
        executor.execute{val r=if(kind=="trash")api.trash()else api.favorites();main.post{val a=if(r.code in 200..299)extractArray(r.body)else JSONArray();if(a.length()==0)b.addView(label(empty,14f,muted).apply{setPadding(0,dp(28),0,0)})else for(i in 0 until a.length()){val o=a.optJSONObject(i)?:continue;b.addView(actionCard(o.optString("name","Documento"),"Abrir documento"){showDocumentActions(o.optString("name","Documento"))},lp(top=8))}}}
        s.addView(b);content.addView(s)
    }
    private fun showCreateDocument(model:String=""){
        val title=EditText(this).apply{hint=if(model.isBlank())"Nome do documento"else"$model · título";setTextColor(this@MainActivity.text);setHintTextColor(muted);isSingleLine=true;background=rounded(panel2,12);setPadding(dp(14),0,dp(14),0)}
        val body=EditText(this).apply{hint="Comece a escrever…";setTextColor(this@MainActivity.text);setHintTextColor(muted);gravity=Gravity.TOP;background=rounded(panel2,12);setPadding(dp(14),dp(14),dp(14),dp(14));minLines=7}
        val box=LinearLayout(this).vertical().apply{setPadding(dp(2),dp(4),dp(2),0);addView(title,lp());addView(body,lp(top=10))}
        android.app.AlertDialog.Builder(this).setTitle("Novo documento").setView(box).setNegativeButton("Cancelar",null).setPositiveButton("Criar"){_,_->createRemoteDocument(title.text.toString().trim().ifBlank{"Novo documento"},body.text.toString())}.show()
    }
    private fun createRemoteDocument(name:String,body:String){
        executor.execute{val r=api.createDocument(name,"document",body);main.post{if(r.code in 200..299){NexusFeedback.toast(this,"Documento criado.",NexusFeedback.Type.SUCCESS);navigate("files")}else NexusFeedback.alert(this,"Não foi possível criar",api.errorMessage(r),NexusFeedback.Type.ERROR)}}
    }
    private fun showCreateFolder(){
        val e=EditText(this).apply{hint="Nome da pasta";setTextColor(this@MainActivity.text);setHintTextColor(muted);isSingleLine=true}
        android.app.AlertDialog.Builder(this).setTitle("Nova pasta").setView(e).setNegativeButton("Cancelar",null).setPositiveButton("Criar"){_,_->executor.execute{val r=api.createFolder(e.text.toString().trim());main.post{NexusFeedback.toast(this,if(r.code in 200..299)"Pasta criada."else api.errorMessage(r),if(r.code in 200..299)NexusFeedback.Type.SUCCESS else NexusFeedback.Type.ERROR)}}}.show()
    }
    private fun showShare(){NexusFeedback.alert(this,"Compartilhar","Escolha um documento nos Arquivos para compartilhar.",NexusFeedback.Type.INFO)}
    private fun showNotifications(){NexusFeedback.alert(this,"Notificações","Você está em dia.\nNenhuma notificação nova.",NexusFeedback.Type.INFO)}
    private fun showComingSoon(name:String){NexusFeedback.toast(this,"$name ficará disponível nesta etapa.",NexusFeedback.Type.INFO)}
    private fun showDocumentActions(name:String){
        android.app.AlertDialog.Builder(this).setTitle(name).setItems(arrayOf("Abrir","Editar","Compartilhar","Favoritar","Mover para a lixeira")){_,which->when(which){0->showComingSoon("Abrir");1->navigate("editor");2->showShare();3->showComingSoon("Favoritos");4->confirmTrash(name)}}.show()
    }
    private fun confirmTrash(name:String){
        NexusFeedback.alert(this,"Mover para a lixeira","Deseja mover \"$name\" para a lixeira?",NexusFeedback.Type.WARNING,"Mover","Cancelar",onPositive={showComingSoon("Lixeira")})
    }

    private fun card(): LinearLayout = LinearLayout(this).vertical().apply {
        background = rounded(panel, 18)
        setPadding(dp(17), dp(17), dp(17), dp(17))
    }

    private fun actionCard(title: String, subtitle: String, click: () -> Unit): LinearLayout = card().apply {
        addView(label(title, 15f, text, true))
        addView(label(subtitle, 10f, muted), lp(top = 7))
        setOnClickListener { click() }
    }

    private fun label(value: String, size: Float, color: Int, bold: Boolean = false): TextView =
        TextView(this).apply {
            text = value
            textSize = size
            setTextColor(color)
            if (bold) setTypeface(Typeface.create("sans-serif", Typeface.BOLD))
        }

    private fun input(hintText: String): EditText = EditText(this).apply {
        hint = hintText
        setHintTextColor(muted)
        setTextColor(this@MainActivity.text)
        textSize = 14f
        isSingleLine = true
        setPadding(dp(14), 0, dp(14), 0)
        background = rounded(Color.rgb(5, 17, 29), 12)
    }

    private fun button(title: String, primary: Boolean): Button = Button(this).apply {
        text = title
        isAllCaps = false
        textSize = 12f
        setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL))
        setTextColor(Color.WHITE)
        stateListAnimator = null
        background = rounded(if (primary) Color.rgb(11, 111, 199) else Color.rgb(9, 31, 49), 11)
        minHeight = dp(44)
        minimumHeight = dp(44)
    }

    private fun iconButton(symbol: String): TextView = TextView(this).apply {
        text = symbol
        textSize = 24f
        gravity = Gravity.CENTER
        setTextColor(this@MainActivity.text)
        background = rounded(Color.rgb(9, 31, 49), 12)
    }

    private fun rounded(color: Int, radius: Int): android.graphics.drawable.GradientDrawable =
        android.graphics.drawable.GradientDrawable().apply {
            setColor(color)
            setStroke(dp(1), line)
            cornerRadius = dp(radius).toFloat()
        }

    private fun LinearLayout.vertical(): LinearLayout {
        orientation = LinearLayout.VERTICAL
        return this
    }

    private fun LinearLayout.horizontal(): LinearLayout {
        orientation = LinearLayout.HORIZONTAL
        return this
    }

    private fun lp(top: Int = 0): LinearLayout.LayoutParams = LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(top) }
    private fun bytes(v: Long): String {
        if (v <= 0) return "0 B"
        val units = arrayOf("B", "KB", "MB", "GB", "TB")
        var n = v.toDouble()
        var i = 0
        while (n >= 1024 && i < units.lastIndex) { n /= 1024; i++ }
        return "%.1f %s".format(n, units[i])
    }
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt().coerceAtLeast(1)
}
