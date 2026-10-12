package harold.android.chat

import androidx.lifecycle.ViewModelProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.android.components.ViewModelComponent
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import dagger.hilt.android.testing.HiltTestApplication
import dagger.hilt.testing.TestInstallIn
import harold.android.MainActivity
import harold.android.di.RestartScheduler
import harold.android.di.SilenceScheduler
import harold.android.di.VoiceDictationModule
import harold.android.testing.FakeSpeechRecognitionClient
import harold.android.voice.ImmediateVoiceDictationRestartScheduler
import harold.android.voice.SpeechRecognitionClient
import harold.android.voice.VoiceDictationRestartScheduler
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@HiltAndroidTest
@RunWith(RobolectricTestRunner::class)
@Config(application = HiltTestApplication::class, sdk = [34])
class VoiceDictationSurvivesRotationTest {
    @get:Rule
    val hiltRule = HiltAndroidRule(this)

    @Before
    fun setUp() {
        hiltRule.inject()
    }

    @Test
    fun rotationKeepsOneDictationController() {
        val controller = Robolectric.buildActivity(MainActivity::class.java).setup()
        val before = ViewModelProvider(controller.get())[ChatViewModel::class.java]

        controller.recreate()

        val after = ViewModelProvider(controller.get())[ChatViewModel::class.java]
        assertSame(before.voiceDictationController, after.voiceDictationController)
    }
}

/** Stands in for the bundled speech model in Hilt tests. */
@Module
@TestInstallIn(
    components = [ViewModelComponent::class],
    replaces = [VoiceDictationModule::class],
)
object FakeVoiceDictationModule {
    @Provides
    fun speechClient(): SpeechRecognitionClient = FakeSpeechRecognitionClient()

    @Provides
    @SilenceScheduler
    fun silenceScheduler(): VoiceDictationRestartScheduler =
        ImmediateVoiceDictationRestartScheduler()

    @Provides
    @RestartScheduler
    fun restartScheduler(): VoiceDictationRestartScheduler =
        ImmediateVoiceDictationRestartScheduler()
}
