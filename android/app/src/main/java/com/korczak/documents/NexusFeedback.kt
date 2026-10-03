package com.korczak.documents

import android.app.Dialog
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.Window
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

object NexusFeedback {
    enum class Type { SUCCESS, ERROR, WARNING, INFO }

    private fun dp(c: Context, n: Int) = (n * c.resources.displayMetrics.density).toInt()

    private fun icon(type: Type): String = when (type) {
        Type.SUCCESS -> "✓"
        Type.ERROR -> "!"
        Type.WARNING -> "!"
        Type.INFO -> "i"
    }

    private fun accent(type: Type): Int = when (type) {
        Type.SUCCESS -> Color.rgb(49, 214, 164)
        Type.ERROR -> Color.rgb(255, 105, 125)
        Type.WARNING -> Color.rgb(241, 189, 90)
        Type.INFO -> Color.rgb(67, 166, 255)
    }

    private fun bg(context: Context, radius: Float = 18f): GradientDrawable =
        GradientDrawable().apply {
            setColor(Color.rgb(7, 22, 38))
            setStroke(dp(context, 1), Color.rgb(29, 72, 104))
            cornerRadius = dp(context, radius.toInt()).toFloat()
        }

    fun toast(context: Context, message: String, type: Type = Type.INFO, duration: Long = 2600L) {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(context, 16), dp(context, 12), dp(context, 18), dp(context, 12))
            background = bg(context)
        }
        val badge = TextView(context).apply {
            text = icon(type)
            gravity = Gravity.CENTER
            textSize = 15f
            setTextColor(Color.WHITE)
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(accent(type))
            }
        }
        root.addView(badge, LinearLayout.LayoutParams(dp(context, 32), dp(context, 32)))
        val text = TextView(context).apply {
            this.text = message
            textSize = 13f
            setTextColor(Color.rgb(235, 245, 255))
            setPadding(dp(context, 11), 0, 0, 0)
        }
        root.addView(text, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        dialog.setContentView(root)
        dialog.setCanceledOnTouchOutside(true)
        dialog.setOnShowListener {
            dialog.window?.apply {
                setBackgroundDrawableResource(android.R.color.transparent)
                setDimAmount(0f)
                attributes = attributes.apply {
                    width = WindowManager.LayoutParams.WRAP_CONTENT
                    height = WindowManager.LayoutParams.WRAP_CONTENT
                    gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                    y = dp(context, 92)
                }
            }
        }
        dialog.show()
        root.postDelayed({ if (dialog.isShowing) dialog.dismiss() }, duration)
    }

    fun snackbar(context: Context, message: String, type: Type = Type.INFO, action: String? = null, onAction: (() -> Unit)? = null) {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(context, 16), dp(context, 12), dp(context, 10), dp(context, 12))
            background = bg(context, 14f)
        }
        val bar = View(context).apply {
            setBackgroundColor(accent(type))
        }
        root.addView(bar, LinearLayout.LayoutParams(dp(context, 3), dp(context, 34)))
        val text = TextView(context).apply {
            this.text = message
            textSize = 13f
            setTextColor(Color.WHITE)
            setPadding(dp(context, 12), 0, dp(context, 8), 0)
        }
        root.addView(text, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        if (action != null) {
            val b = Button(context).apply {
                this.text = action.uppercase()
                textSize = 11f
                setTextColor(accent(type))
                background = GradientDrawable().apply {
                    setColor(Color.TRANSPARENT)
                    setStroke(dp(context, 1), accent(type))
                    cornerRadius = dp(context, 9).toFloat()
                }
                setOnClickListener {
                    onAction?.invoke()
                    dialog.dismiss()
                }
            }
            root.addView(b, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(context, 40)))
        }
        dialog.setContentView(root)
        dialog.setOnShowListener {
            dialog.window?.apply {
                setBackgroundDrawableResource(android.R.color.transparent)
                setDimAmount(0f)
                attributes = attributes.apply {
                    width = WindowManager.LayoutParams.MATCH_PARENT
                    height = WindowManager.LayoutParams.WRAP_CONTENT
                    gravity = Gravity.BOTTOM
                    y = dp(context, 84)
                }
            }
        }
        dialog.show()
        root.postDelayed({ if (dialog.isShowing) dialog.dismiss() }, 5000L)
    }

    fun alert(context: Context, title: String, message: String, type: Type = Type.INFO, positive: String = "OK", negative: String? = null, onPositive: (() -> Unit)? = null, onNegative: (() -> Unit)? = null) {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(context, 22), dp(context, 20), dp(context, 22), dp(context, 18))
            background = bg(context, 22f)
        }
        val head = LinearLayout(context).apply { gravity = Gravity.CENTER_VERTICAL }
        val badge = TextView(context).apply {
            text = icon(type); gravity = Gravity.CENTER; textSize = 16f; setTextColor(Color.WHITE)
            background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(accent(type)) }
        }
        head.addView(badge, LinearLayout.LayoutParams(dp(context, 38), dp(context, 38)))
        val titleView = TextView(context).apply {
            text = title; textSize = 18f; setTextColor(Color.WHITE); setPadding(dp(context, 12), 0, 0, 0)
        }
        head.addView(titleView, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(head)
        val body = TextView(context).apply {
            text = message; textSize = 14f; setTextColor(Color.rgb(166, 190, 211)); setPadding(0, dp(context, 16), 0, dp(context, 12))
        }
        root.addView(body)
        val actions = LinearLayout(context).apply { gravity = Gravity.END }
        if (negative != null) {
            val b = button(context, negative, Color.rgb(154, 177, 198))
            b.setOnClickListener { onNegative?.invoke(); dialog.dismiss() }
            actions.addView(b)
        }
        val p = button(context, positive, accent(type))
        p.setOnClickListener { onPositive?.invoke(); dialog.dismiss() }
        actions.addView(p)
        root.addView(actions)
        dialog.setContentView(root)
        dialog.setCanceledOnTouchOutside(false)
        dialog.setOnShowListener {
            dialog.window?.apply {
                setBackgroundDrawableResource(android.R.color.transparent)
                setDimAmount(.58f)
                attributes = attributes.apply {
                    width = minOf(dp(context, 420), context.resources.displayMetrics.widthPixels - dp(context, 32))
                    height = WindowManager.LayoutParams.WRAP_CONTENT
                    gravity = Gravity.CENTER
                }
            }
        }
        dialog.show()
    }

    fun progress(context: Context, title: String, message: String): Dialog {
        val dialog = Dialog(context)
        dialog.requestWindowFeature(Window.FEATURE_NO_TITLE)
        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(context, 22), dp(context, 20), dp(context, 22), dp(context, 20))
            background = bg(context, 22f)
        }
        root.addView(TextView(context).apply { text = title; textSize = 18f; setTextColor(Color.WHITE) })
        root.addView(TextView(context).apply { text = message; textSize = 13f; setTextColor(Color.rgb(166,190,211)); setPadding(0,dp(context,8),0,dp(context,14)) })
        root.addView(ProgressBar(context).apply { isIndeterminate = true })
        dialog.setContentView(root)
        dialog.setCanceledOnTouchOutside(false)
        dialog.show()
        dialog.window?.apply {
            setBackgroundDrawableResource(android.R.color.transparent)
            setDimAmount(.45f)
            attributes = attributes.apply {
                width = minOf(dp(context, 420), context.resources.displayMetrics.widthPixels - dp(context, 32))
                height = WindowManager.LayoutParams.WRAP_CONTENT
                gravity = Gravity.CENTER
            }
        }
        return dialog
    }

    private fun button(context: Context, text: String, color: Int): Button =
        Button(context).apply {
            this.text = text
            textSize = 11f
            setTextColor(color)
            background = GradientDrawable().apply {
                setColor(Color.rgb(10, 35, 57))
                setStroke(dp(context, 1), color)
                cornerRadius = dp(context, 10).toFloat()
            }
            minHeight = dp(context, 42)
            setPadding(dp(context, 14), 0, dp(context, 14), 0)
        }
}
