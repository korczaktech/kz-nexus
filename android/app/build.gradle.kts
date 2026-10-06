plugins {
 id("com.android.application")
 id("org.jetbrains.kotlin.android")
}
val releaseVersion=providers.gradleProperty("releaseVersion").orElse("0.0.0.1").get()
val releaseCode=providers.gradleProperty("releaseCode").orElse("1").get().toInt()
val ks=System.getenv("ANDROID_KEYSTORE_FILE");val kp=System.getenv("ANDROID_KEYSTORE_PASSWORD");val ka=System.getenv("ANDROID_KEY_ALIAS");val kkp=System.getenv("ANDROID_KEY_PASSWORD")
android{namespace="com.korczak.documents";compileSdk=35
 buildFeatures{buildConfig=true}
 compileOptions{sourceCompatibility=JavaVersion.VERSION_17;targetCompatibility=JavaVersion.VERSION_17}
 kotlinOptions{jvmTarget="17"}
 defaultConfig{
  applicationId="com.korczak.documents"
  minSdk=26
  targetSdk=35
  versionCode=releaseCode
  versionName=releaseVersion
  testInstrumentationRunner="androidx.test.runner.AndroidJUnitRunner"
}
 signingConfigs{create("release"){if(ks!=null)storeFile=file(ks);if(kp!=null)storePassword=kp;if(ka!=null)keyAlias=ka;if(kkp!=null)keyPassword=kkp}}
 buildTypes{debug{isMinifyEnabled=false};release{isMinifyEnabled=false;signingConfig=signingConfigs.getByName("release")}}
}
dependencies{
 implementation("androidx.core:core-ktx:1.15.0")
 implementation("androidx.appcompat:appcompat:1.7.0")
 implementation("androidx.documentfile:documentfile:1.0.1")
 // WebKit 1.6.1 is from the WebView 111-era API generation and avoids requiring newer AndroidX WebKit APIs. The Chromium engine itself remains the device WebView provider.\n implementation("androidx.webkit:webkit:1.6.1")
 testImplementation("junit:junit:4.13.2")
 androidTestImplementation("androidx.test.ext:junit:1.2.1")
 androidTestImplementation("androidx.test:rules:1.6.1")
}