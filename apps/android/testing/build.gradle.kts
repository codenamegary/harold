
plugins {
    alias(libs.plugins.harold.android.library)
}

android {
    namespace = "harold.android.testing"
}

dependencies {
    implementation(project(":auth"))
    implementation(libs.kotlinx.coroutines.android)
}
