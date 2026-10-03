package com.korczak.documents

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.widget.Toast

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
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                    )
                    context.startActivity(confirmation)
                } else {
                    Toast.makeText(
                        context,
                        "O Android precisa confirmar a instalação.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }

            PackageInstaller.STATUS_SUCCESS -> {
                Toast.makeText(
                    context,
                    "KZ Documents atualizado com sucesso.",
                    Toast.LENGTH_LONG
                ).show()
            }

            else -> {
                Toast.makeText(
                    context,
                    "Não foi possível atualizar: " + (message.ifBlank { "erro de instalação" }),
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }
}
