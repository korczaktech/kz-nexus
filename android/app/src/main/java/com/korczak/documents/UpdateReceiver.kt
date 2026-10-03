package com.korczak.documents

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller

class UpdateReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE
        )
        val message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE) ?: ""

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmation = if (android.os.Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                if (confirmation != null) {
                    confirmation.addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    )
                    context.startActivity(confirmation)
                } else {
                    showInNexus(context, "warning", "O Android precisa confirmar a instalação.", "Atualização")
                }
            }

            PackageInstaller.STATUS_SUCCESS -> {
                showInNexus(context, "success", "Korczak Nexus foi atualizado com sucesso.", "Atualização concluída")
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                try {
                    context.startActivity(
                        Intent(
                            android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            android.net.Uri.parse("package:" + context.packageName)
                        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    )
                } catch (_: Exception) { }
                showInNexus(
                    context,
                    "error",
                    "O Android bloqueou a instalação. Autorize o Nexus a instalar atualizações.",
                    "Atualização bloqueada"
                )
            }

            else -> {
                showInNexus(
                    context,
                    "error",
                    message.ifBlank { "Não foi possível instalar a atualização." },
                    "Falha na atualização"
                )
            }
        }
    }

    private fun showInNexus(context: Context, type: String, message: String, title: String) {
        val launch = Intent(context, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            putExtra("nexus_feedback_type", type)
            putExtra("nexus_feedback_message", message)
            putExtra("nexus_feedback_title", title)
        }
        context.startActivity(launch)
    }
}
