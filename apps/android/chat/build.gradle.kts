plugins {
    alias(libs.plugins.harold.android.feature)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.chat"
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(project(":auth"))
    implementation(project(":live"))
    implementation(project(":voice"))
    implementation(project(":design"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.feature)
    implementation(libs.bundles.compose.ui)
    implementation(libs.androidx.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.markdown.renderer.android)
    implementation(libs.markdown.renderer.m3)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    kspTest(libs.androidx.room.compiler)
}
