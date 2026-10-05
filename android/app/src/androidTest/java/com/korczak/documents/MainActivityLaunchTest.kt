package com.korczak.documents

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.rule.ActivityTestRule
import org.junit.runner.RunWith
import org.junit.Rule
import org.junit.Test
import org.junit.Assert.assertNotNull

@RunWith(AndroidJUnit4::class)
class MainActivityLaunchTest {
    @get:Rule val rule = ActivityTestRule(MainActivity::class.java)

    @Test fun activityStartsWithNexusUi() {
        val activity = rule.activity
        assertNotNull(activity)
        assertNotNull(activity.findViewById<android.view.View>(android.R.id.content))
    }
}