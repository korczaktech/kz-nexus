package com.korczak.documents

import android.os.SystemClock
import android.webkit.WebView
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

@RunWith(AndroidJUnit4::class)
class MainActivityLaunchTest {
    @get:Rule val rule = ActivityTestRule(MainActivity::class.java)

    @Test fun activityStartsWithNexusUi() {
        val activity = rule.activity
        assertNotNull(activity)
        assertNotNull(activity.findViewById<android.view.View>(android.R.id.content))

        SystemClock.sleep(3500)

        val webView = AtomicReference<WebView?>()
        rule.runOnUiThread {
            webView.set(activity.findViewById(android.R.id.content))
        }
        assertNotNull("A Activity precisa manter uma view de conteúdo após o startup", webView.get())
    }

    @Test fun webViewLoadsLocalShellAndNativeBridge() {
        val activity = rule.activity
        SystemClock.sleep(3500)

        val webView = AtomicReference<WebView?>()
        rule.runOnUiThread {
            webView.set(activity.findViewById<WebView?>(android.R.id.content)?.let { content ->
                fun find(v: android.view.View): WebView? {
                    if (v is WebView) return v
                    if (v is android.view.ViewGroup) {
                        for (i in 0 until v.childCount) find(v.getChildAt(i))?.let { return it }
                    }
                    return null
                }
                find(content)
            })
        }
        val view = webView.get()
        assertNotNull("WebView do Nexus não foi criado", view)

        val latch = CountDownLatch(1)
        val result = AtomicReference<String>()
        rule.runOnUiThread {
            view!!.evaluateJavascript(
                "(function(){return JSON.stringify({url:location.href,android:!!window.Android,html:!!document.documentElement,body:!!document.body})})()"
            ) { value ->
                result.set(value)
                latch.countDown()
            }
        }
        assertTrue("O WebView não respondeu ao teste de startup", latch.await(5, TimeUnit.SECONDS))
        val value = result.get()
        assertNotNull(value)
        assertTrue("O shell local não carregou: $value", value.contains("appassets.androidplatform.net"))
        assertTrue("A bridge nativa Android não foi exposta: $value", value.contains("\"android\":true"))
        assertTrue("O documento HTML não carregou: $value", value.contains("\"html\":true"))
        assertTrue("O body não carregou: $value", value.contains("\"body\":true"))
    }
}
