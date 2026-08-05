package server.agent.android

import android.app.Application
import server.agent.android.di.AppContainer
import server.agent.android.di.DefaultAppContainer

class AgentServerApplication : Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = DefaultAppContainer()
    }
}
