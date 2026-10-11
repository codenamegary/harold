plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}

tasks.register("testBuildLogic") {
    group = "verification"
    description = "Runs convention plugin tests."
    dependsOn(gradle.includedBuild("build-logic").task(":convention:test"))
}
