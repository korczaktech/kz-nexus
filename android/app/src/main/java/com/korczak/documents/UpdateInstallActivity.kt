package com.korczak.documents

import android.app.Activity
import android.os.Bundle
import android.content.Intent
import android.content.pm.PackageInstaller

/**
 * Receives PackageInstaller status through an IntentSender.
 * Keeping this as an Activity lets Android deliver STATUS_PENDING_USER_ACTION
 * through the normal activity launch path, so the system confirmation UI can appear.
 */
class UpdateInstallActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        handle(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    private fun handle(result: Intent?) {
        if (result == null) {
            finish()
            return
        }

        when (result.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE
        )) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmation = if (android.os.Build.VERSION.SDK_INT >= 33) {
                    result.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    result.getParcelableExtra(Intent.EXTRA_INTENT)
                }

                if (confirmation != null) {
                    confirmation.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    try {
                        startActivity(confirmation)
                    } catch (e: Exception) {
                        showFailure("O Android não conseguiu abrir a confirmação da instalação.")
                    }
                } else {
                    showFailure("O Android não forneceu a confirmação da instalação.")
                }
            }

            PackageInstaller.STATUS_SUCCESS -> {
                showResult("success", "Korczak Nexus foi atualizado com sucesso.", "Atualização concluída")
            }

            PackageInstaller.STATUS_FAILURE_BLOCKED -> {
                try {
                    startActivity(
                        Intent(
                            android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            android.net.Uri.parse("package:$packageName")
                        )
                    )
                } catch (_: Exception) { }
                showResult("error", "O Android bloqueou a instalação. Autorize o Nexus a instalar atualizações.", "Atualização bloqueada")
            }

            else -> {
                val message = result.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    ?: "Não foi possível instalar a atualização."
                showResult("error", message, "Falha na atualização")
            }
        }
    }

    private fun showFailure(message: String) {
        showResult("error", message, "Falha na atualização")
    }

    private fun showResult(type: String, message: String, title: String) {
        val launch = Intent(this, MainActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            putExtra("nexus_feedback_type", type)
            putExtra("nexus_feedback_message", message)
            putExtra("nexus_feedback_title", title)
        }
        startActivity(launch)
        finish()
    }
}
