import com.android.build.api.dsl.CommonExtension
import org.gradle.api.JavaVersion

internal fun CommonExtension.configureHaroldAndroid() {
    compileSdk {
        version = release(37) {
            minorApiLevel = 0
        }
    }
    defaultConfig.minSdk = 30
    defaultConfig.testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    compileOptions.sourceCompatibility = JavaVersion.VERSION_17
    compileOptions.targetCompatibility = JavaVersion.VERSION_17
    testOptions.unitTests.isIncludeAndroidResources = true
}
