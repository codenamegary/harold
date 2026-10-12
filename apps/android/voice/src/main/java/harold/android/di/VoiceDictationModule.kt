package harold.android.di

import android.app.Application
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.components.ViewModelComponent
import dagger.hilt.android.scopes.ViewModelScoped
import harold.android.chat.HandlerVoiceDictationRestartScheduler
import harold.android.chat.SpeechRecognitionClient
import harold.android.chat.VoiceDictationRestartScheduler
import harold.android.chat.VoskSpeechRecognitionClient

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
