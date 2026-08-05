package server.agent.android.di

interface SessionGateway {
    fun isPaired(): Boolean
}

class DefaultSessionGateway : SessionGateway {
    override fun isPaired(): Boolean = false
}

interface AppContainer {
    val sessionGateway: SessionGateway
}

class DefaultAppContainer(
    override val sessionGateway: SessionGateway = DefaultSessionGateway(),
) : AppContainer
