package com.korczak.documents

import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.Executors

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
    private lateinit var bottom: LinearLayout
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

    private val bg = Color.rgb(3, 9, 20)
    private val panel = Color.rgb(7, 22, 38)
    private val panel2 = Color.rgb(9, 29, 48)
    private val line = Color.rgb(27, 63, 91)
    private val blue = Color.rgb(41, 156, 255)
    private val cyan = Color.rgb(83, 200, 255)
    private val text = Color.rgb(238, 247, 255)
    private val muted = Color.rgb(143, 168, 192)
    private val green = Color.rgb(49, 214, 164)
    private val red = Color.rgb(255, 111, 125)

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = bg
        window.navigationBarColor = bg

        session = SessionStore(this)
        api = ApiClient(session)
        storage = StorageManager(this)

        if (session.token.isNullOrBlank()) {
            showAuth()
        } else {
            showApp()
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        if (::session.isInitialized && !session.token.isNullOrBlank()) {
            Updater(this).resumePending()
            main.postDelayed({ checkForUpdate() }, 1200)
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
        val bar = LinearLayout(this).horizontal().apply {
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(18), dp(10), dp(14), dp(10))
            background = rounded(Color.rgb(6, 17, 30), 0)
        }
        val logo = ImageView(this).apply { setImageResource(R.drawable.ic_kz); scaleType = ImageView.ScaleType.CENTER_INSIDE }
        bar.addView(logo, LinearLayout.LayoutParams(dp(46), dp(46)))
        val title = LinearLayout(this).vertical()
        title.addView(label("Korczak Nexus", 16f, text, true))
        title.addView(label("DOCUMENTOS • ANDROID NATIVO", 9f, blue, true))
        bar.addView(title, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(9) })
        val online = TextView(this).apply {
            text = "●"
            textSize = 13f
            setTextColor(green)
            gravity = Gravity.CENTER
            setPadding(dp(8), 0, dp(8), 0)
        }
        bar.addView(online, LinearLayout.LayoutParams(dp(36), -1))
        val more = iconButton("⋮")
        more.setOnClickListener { navigate("more") }
        bar.addView(more, LinearLayout.LayoutParams(dp(44), dp(44)))
        return bar
    }

    private fun buildBottomBar(): LinearLayout {
        val bar = LinearLayout(this).horizontal().apply {
            gravity = Gravity.CENTER
            setPadding(dp(7), dp(7), dp(7), dp(8))
            background = rounded(Color.rgb(6, 17, 30), 0)
        }
        val tabs = listOf("home" to "⌂\nInício", "files" to "▤\nArquivos", "editor" to "✎\nEditor", "more" to "⋯\nMais")
        tabs.forEach { (id, caption) ->
            val b = TextView(this).apply {
                text = caption
                gravity = Gravity.CENTER
                textSize = 11f
                setTypeface(null, Typeface.BOLD)
                setTextColor(if (id == selectedTab) cyan else muted)
                background = rounded(if (id == selectedTab) Color.rgb(10, 43, 69) else Color.TRANSPARENT, 13)
                setPadding(0, dp(4), 0, dp(2))
                setOnClickListener { navigate(id) }
            }
            bar.addView(b, LinearLayout.LayoutParams(0, -1, 1f).apply { leftMargin = dp(3); rightMargin = dp(3) })
        }
        return bar
    }

    private fun navigate(page: String) {
        selectedTab = page
        content.removeAllViews()
        when (page) {
            "home" -> renderHome()
            "files" -> renderFiles()
            "editor" -> renderEditor(null, null, null)
            else -> renderMore()
        }
        val old = root.getChildAt(root.childCount - 1)
        root.removeView(old)
        bottom = buildBottomBar()
        root.addView(bottom, LinearLayout.LayoutParams(-1, dp(70)))
    }

    private fun renderHome() {
        val scroll = ScrollView(this)
        val box = LinearLayout(this).vertical().apply { setPadding(dp(18), dp(18), dp(18), dp(24)) }
        box.addView(card().apply {
            addView(label("SEU ESPAÇO DE DOCUMENTOS", 10f, cyan, true))
            addView(label("Tudo organizado em um só lugar.", 28f, text, true).apply { setPadding(0, dp(8), 0, dp(7)) })
            addView(label("Editor, arquivos, armazenamento e sincronização com a NexusAPI.", 13f, muted))
            addView(button("Criar documento", true).apply { setOnClickListener { renderEditor(null, null, null) } }, lp(top = 18))
        }, lp())
        val actions = LinearLayout(this).horizontal()
        actions.addView(actionCard("Arquivos", "Acesse seus documentos") { navigate("files") }, LinearLayout.LayoutParams(0, dp(112), 1f).apply { rightMargin = dp(6) })
        actions.addView(actionCard("Editor", "Crie e edite") { renderEditor(null, null, null) }, LinearLayout.LayoutParams(0, dp(112), 1f).apply { leftMargin = dp(6) })
        box.addView(actions, lp(top = 12))

        val storageCard = card()
        storageCard.addView(label("ARMAZENAMENTO", 10f, cyan, true))
        val storageName = label(storage.label(), 15f, text, true)
        storageCard.addView(storageName, lp(top = 7))
        storageCard.addView(label("Escolha uma pasta do dispositivo para manter seus arquivos locais.", 11f, muted), lp(top = 4))
        val storageActions = LinearLayout(this).horizontal()
        storageActions.addView(button("Selecionar pasta", true).apply {
            setOnClickListener { chooseStorage() }
        }, LinearLayout.LayoutParams(0, dp(44), 1f).apply { rightMargin = dp(5); topMargin = dp(12) })
        storageActions.addView(button("Atualizar", false).apply {
            setOnClickListener { navigate("home") }
        }, LinearLayout.LayoutParams(0, dp(44), 1f).apply { leftMargin = dp(5); topMargin = dp(12) })
        storageCard.addView(storageActions)
        box.addView(storageCard, lp(top = 12))

        val net = offlineState()
        val status = card()
        status.addView(label("STATUS", 10f, cyan, true))
        status.addView(label(if (net) "Conectado à internet" else "Modo offline", 15f, if (net) green else Color.rgb(241,189,90), true), lp(top = 7))
        status.addView(label("As alterações locais podem continuar sem conexão.", 11f, muted), lp(top = 4))
        box.addView(status, lp(top = 12))

        scroll.addView(box)
        content.addView(scroll)
    }

    private fun renderFiles() {
        val scroll = ScrollView(this)
        val box = LinearLayout(this).vertical().apply { setPadding(dp(18), dp(18), dp(18), dp(28)) }
        val head = LinearLayout(this).horizontal()
        val h = LinearLayout(this).vertical()
        h.addView(label("ARQUIVOS", 10f, cyan, true))
        h.addView(label("Seus documentos", 26f, text, true), lp(top = 4))
        head.addView(h, LinearLayout.LayoutParams(0, -2, 1f))
        head.addView(button("+ Novo", true).apply { setOnClickListener { renderEditor(null, null, null) } }, LinearLayout.LayoutParams(dp(100), dp(44)))
        box.addView(head)

        val progress = ProgressBar(this).apply { isIndeterminate = true }
        box.addView(progress, lp(top = 16))
        scroll.addView(box)
        content.addView(scroll)

        executor.execute {
            val apiResult = if (!session.token.isNullOrBlank()) api.documents() else ApiResult(0, "[]")
            val local = storage.listFiles()
            main.post {
                progress.visibility = View.GONE
                if (apiResult.code in 200..299) {
                    addDocumentItems(box, extractArray(apiResult.body), false)
                } else if (local.length() == 0) {
                    box.addView(label("Não foi possível carregar os documentos.", 13f, muted), lp(top = 20))
                    box.addView(button("Tentar novamente", false).apply { setOnClickListener { renderFiles() } }, lp(top = 10))
                }
                if (local.length() > 0) {
                    box.addView(label("ARQUIVOS DO DISPOSITIVO", 10f, cyan, true), lp(top = 22))
                    addDocumentItems(box, local, true)
                }
            }
        }
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

    private fun renderEditor(id: String?, name: String?, body: String?) {
        currentDocumentId = id
        currentDocumentUri = null
        val box = LinearLayout(this).vertical().apply { setPadding(dp(14), dp(12), dp(14), dp(18)) }
        val header = LinearLayout(this).horizontal()
        header.addView(button("‹ Voltar", false).apply { setOnClickListener { navigate("home") } }, LinearLayout.LayoutParams(dp(100), dp(44)))
        val status = TextView(this).apply { text = "Novo documento"; gravity = Gravity.CENTER_VERTICAL; setTextColor(muted); textSize = 11f }
        editorStatus = status
        header.addView(status, LinearLayout.LayoutParams(0, dp(44), 1f).apply { leftMargin = dp(8) })
        header.addView(button("Salvar", true).apply { setOnClickListener { saveEditor() } }, LinearLayout.LayoutParams(dp(100), dp(44)))
        box.addView(header)

        val title = input("Nome do documento").apply { setText(name ?: "Documento sem título"); textSize = 17f; setSingleLine(true) }
        editorTitle = title
        box.addView(title, lp(top = 12))
        val bodyInput = EditText(this).apply {
            hint = "Comece a escrever..."
            setText(body ?: "")
            setTextColor(this@MainActivity.text)
            setHintTextColor(muted)
            textSize = 16f
            gravity = Gravity.TOP or Gravity.START
            setPadding(dp(14), dp(14), dp(14), dp(14))
            background = rounded(panel, 16)
            minLines = 16
            isSingleLine = false
        }
        editorBody = bodyInput
        box.addView(bodyInput, LinearLayout.LayoutParams(-1, 0, 1f).apply { topMargin = dp(12) })

        val tools = LinearLayout(this).horizontal()
        listOf("B", "I", "Título", "Lista", "Limpar").forEach { t ->
            tools.addView(button(t, false).apply {
                setOnClickListener {
                    when (t) {
                        "B" -> wrapSelection("**")
                        "I" -> wrapSelection("_")
                        "Título" -> insertAtCursor("# ")
                        "Lista" -> insertAtCursor("• ")
                        "Limpar" -> bodyInput.setSelection(bodyInput.text.length)
                    }
                }
            }, LinearLayout.LayoutParams(0, dp(42), 1f).apply { leftMargin = dp(3); rightMargin = dp(3) })
        }
        box.addView(tools, lp(top = 8))
        content.addView(box)
        if (id != null && body.isNullOrBlank()) {
            editorStatus?.text = "Carregando documento..."
            executor.execute {
                val r = api.document(id)
                main.post {
                    if (r.code in 200..299) {
                        val o = extractObject(r.body)
                        editorTitle?.setText(o?.optString("name", name ?: "Documento") ?: name ?: "Documento")
                        editorBody?.setText(o?.optString("content", "") ?: "")
                        editorStatus?.text = "Pronto"
                    } else editorStatus?.text = "Não foi possível carregar"
                }
            }
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

    private fun renderMore() {
        val scroll = ScrollView(this)
        val box = LinearLayout(this).vertical().apply { setPadding(dp(18), dp(18), dp(18), dp(28)) }
        box.addView(label("MAIS", 10f, cyan, true))
        box.addView(label("Nexus", 28f, text, true), lp(top = 4))
        val cards = listOf(
            "Meu perfil" to "Conta e informações pessoais",
            "Armazenamento" to "Pasta local e arquivos do dispositivo",
            "Lixeira" to "Documentos enviados para a lixeira",
            "Favoritos" to "Documentos marcados como favoritos",
            "Sobre o Nexus" to "Versão e informações do aplicativo",
            "Atualizações" to "Verificar uma nova versão",
            "Sair" to "Encerrar a sessão atual"
        )
        cards.forEach { (title, subtitle) ->
            val c = card().horizontal().apply { gravity = Gravity.CENTER_VERTICAL }
            val t = LinearLayout(this).vertical()
            t.addView(label(title, 14f, text, true))
            t.addView(label(subtitle, 10f, muted), lp(top = 4))
            c.addView(t, LinearLayout.LayoutParams(0, -2, 1f))
            c.addView(iconButton("›"))
            c.setOnClickListener {
                when (title) {
                    "Meu perfil" -> showProfile()
                    "Armazenamento" -> showStorage()
                    "Lixeira" -> showTrash()
                    "Favoritos" -> showFavorites()
                    "Sobre o Nexus" -> showAbout()
                    "Atualizações" -> checkForUpdate(true)
                    "Sair" -> logout()
                }
            }
            box.addView(c, lp(top = 9))
        }
        scroll.addView(box)
        content.addView(scroll)
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
