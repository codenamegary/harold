package server.agent.android

import android.content.Context
import server.agent.android.di.AppContainer
import server.agent.android.di.DefaultAppContainer

class AgentServerApplication : android.app.Application() {
    lateinit var appContainer: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        appContainer = DefaultAppContainer(applicationContext)
    }
}
