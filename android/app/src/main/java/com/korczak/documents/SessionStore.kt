package com.korczak.documents

import android.content.Context

class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("kzdoc_session", Context.MODE_PRIVATE)
    var token: String?
        get() = prefs.getString("token", null)
        set(value) { prefs.edit().putString("token", value).apply() }
    var userJson: String?
        get() = prefs.getString("user", null)
        set(value) { prefs.edit().putString("user", value).apply() }
    fun clear() { prefs.edit().clear().apply() }
}
