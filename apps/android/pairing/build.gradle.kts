plugins {
    alias(libs.plugins.harold.android.feature)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.pairing"
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":api"))
    implementation(project(":auth"))
    implementation(project(":design"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.feature)
    implementation(libs.bundles.compose.ui)
    implementation(libs.androidx.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.zxing.core)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
}
