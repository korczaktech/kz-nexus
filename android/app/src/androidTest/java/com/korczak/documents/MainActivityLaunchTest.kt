package com.korczak.documents

import android.widget.TextView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityLaunchTest {
    @get:Rule val rule = ActivityTestRule(MainActivity::class.java)

    @Test fun activityStartsAsNativeAndroidScreen() {
        val activity = rule.activity
        assertNotNull(activity)
        assertTrue("A Activity foi encerrada durante o startup", !activity.isFinishing && !activity.isDestroyed)
        val content = activity.findViewById<android.view.View>(android.R.id.content)
        assertNotNull("A Activity precisa ter conteúdo nativo", content)
        assertTrue("A tela inicial deve usar Views Android nativas", content !is android.webkit.WebView)
    }

    @Test fun nativeUiContainsNexusBranding() {
        val activity = rule.activity
        rule.runOnUiThread {
            val content = activity.findViewById<android.view.View>(android.R.id.content)
            assertNotNull(content)
        }
        val root = activity.window.decorView
        val labels = mutableListOf<String>()
        fun walk(v: android.view.View) {
            if (v is TextView) labels.add(v.text?.toString().orEmpty())
            if (v is android.view.ViewGroup) {
                for (i in 0 until v.childCount) walk(v.getChildAt(i))
            }
        }
        walk(root)
        assertTrue("A interface nativa não exibiu a marca do Nexus", labels.any { it.contains("Nexus", ignoreCase = true) })
    }
}
