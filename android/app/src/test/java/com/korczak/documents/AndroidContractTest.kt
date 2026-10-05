package com.korczak.documents

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AndroidContractTest {
    @Test fun officialApkNameIsAccepted() {
        val re = Regex("^Korczak-HUB-Nexus-[0-9]+(\\.[0-9]+){1,3}\\.apk$")
        assertTrue(re.matches("Korczak-HUB-Nexus-0.0.0.160.apk"))
        assertFalse(re.matches("Korczak-Nexus-v0.0.0.160.apk"))
        assertFalse(re.matches("app-release.apk"))
    }

    @Test fun invalidVersionsAreRejected() {
        val re = Regex("^\\d+(\\.\\d+){1,3}$")
        assertTrue(re.matches("0.0.0.160"))
        assertFalse(re.matches("v0.0.0.160"))
        assertFalse(re.matches("0.0.0.160-alpha"))
    }
}
