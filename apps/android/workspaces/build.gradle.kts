plugins {
    alias(libs.plugins.harold.android.feature)
    alias(libs.plugins.harold.android.hilt)
}

android {
    namespace = "harold.android.workspaces"
}

dependencies {
    implementation(project(":navigation"))
    implementation(project(":contracts"))
    implementation(project(":api"))
    implementation(project(":auth"))
    implementation(project(":design"))
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.bundles.feature)
    implementation(libs.bundles.compose.ui)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    debugImplementation(libs.bundles.compose.debug)

    testImplementation(project(":testing"))
    testImplementation(libs.bundles.unit.test)
    testImplementation(libs.androidx.compose.ui.test.junit4)
    kspTest(libs.androidx.room.compiler)
}
