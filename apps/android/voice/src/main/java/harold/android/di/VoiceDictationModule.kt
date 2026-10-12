package harold.android.di

import android.app.Application
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.components.ViewModelComponent
import dagger.hilt.android.scopes.ViewModelScoped
import harold.android.voice.HandlerVoiceDictationRestartScheduler
import harold.android.voice.SpeechRecognitionClient
import harold.android.voice.VoiceDictationRestartScheduler
import harold.android.voice.VoskSpeechRecognitionClient

@Module
@InstallIn(ViewModelComponent::class)
object VoiceDictationModule {
    @Provides
    @ViewModelScoped
    fun speechClient(application: Application): SpeechRecognitionClient =
        VoskSpeechRecognitionClient(application)

    @Provides
    @SilenceScheduler
    fun silenceScheduler(): VoiceDictationRestartScheduler =
        HandlerVoiceDictationRestartScheduler()

    @Provides
    @RestartScheduler
    fun restartScheduler(): VoiceDictationRestartScheduler =
        HandlerVoiceDictationRestartScheduler()
}
