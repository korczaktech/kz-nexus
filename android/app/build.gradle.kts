plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
val releaseVersion = providers.gradleProperty("releaseVersion").orElse("0.0.0.1").get()
val releaseCode = providers.gradleProperty("releaseCode").orElse("1").get().toInt()
android {
    namespace = "com.korczak.documents"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.korczak.documents"
        minSdk = 26
        targetSdk = 35
        versionCode = releaseCode
        versionName = releaseVersion
    }
    buildTypes {
        debug { isMinifyEnabled = false }
        release { isMinifyEnabled = false }
    }
}
dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
