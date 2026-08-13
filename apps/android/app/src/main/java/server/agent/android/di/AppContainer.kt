package server.agent.android.di

import android.content.Context
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import server.agent.android.BuildConfig
import server.agent.android.connection.ConnectionGateway
import server.agent.android.connection.DefaultConnectionGateway
import server.agent.android.credentials.CredentialHolder
import server.agent.android.credentials.CredentialStore
import server.agent.android.credentials.DefaultCredentialStore
import server.agent.android.events.EventStreamFactory
import server.agent.android.events.OkHttpEventStream
import server.agent.android.events.OkHttpSessionStreamFactory
import server.agent.android.events.SessionStreamFactory
import server.agent.android.foreground.ActiveSessionTracker
import server.agent.android.foreground.AndroidNotificationPermissionChecker
import server.agent.android.foreground.AndroidSessionForegroundLauncher
import server.agent.android.foreground.DefaultActiveSessionTracker
import server.agent.android.foreground.DefaultOpenSessionRequests
import server.agent.android.foreground.DefaultSessionStreamBroker
import server.agent.android.foreground.OpenSessionRequests
import server.agent.android.foreground.SessionForegroundCoordinator
import server.agent.android.foreground.SessionStreamBroker
import server.agent.android.navigation.DefaultNavigationPreferences
import server.agent.android.navigation.NavigationPreferences
import server.agent.android.network.AgentApi
import server.agent.android.network.BearerAuthInterceptor
import server.agent.android.network.DefaultAgentApi
import server.agent.android.network.DefaultPairingApi
import server.agent.android.network.PairingApi
import server.agent.android.operator.DefaultOperatorRepository
import server.agent.android.operator.OperatorRepository
import server.agent.android.pairing.DefaultPairingCoordinator
import server.agent.android.pairing.DefaultPairingPayloadParser
import server.agent.android.pairing.PairingCoordinator
import server.agent.android.pairing.PairingPayloadParser
import server.agent.android.pairing.defaultDeviceName
import server.agent.android.session.DefaultSessionGateway
import server.agent.android.session.SessionGateway

private const val WEB_SOCKET_PING_SECONDS = 20L

interface AppContainer {
    val sessionGateway: SessionGateway
    val credentialStore: CredentialStore
    val pairingApi: PairingApi
    val pairingPayloadParser: PairingPayloadParser
    val pairingCoordinator: PairingCoordinator
    val deviceNameProvider: () -> String
    val agentApi: AgentApi
    val connectionGateway: ConnectionGateway
    val eventStreamFactory: EventStreamFactory
    val sessionStreamFactory: SessionStreamFactory
    val navigationPreferences: NavigationPreferences
    val operatorRepository: OperatorRepository
    val activeSessionTracker: ActiveSessionTracker
    val sessionStreamBroker: SessionStreamBroker
    val sessionForegroundCoordinator: SessionForegroundCoordinator
    val openSessionRequests: OpenSessionRequests
}

class DefaultAppContainer(
    context: Context,
) : AppContainer {
    private val credentialHolder = CredentialHolder()
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /** One client for every authenticated call, HTTP and WebSocket Upgrade alike. */
    private val authenticatedClient: OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(BearerAuthInterceptor(credentialHolder::current))
        .pingInterval(WEB_SOCKET_PING_SECONDS, TimeUnit.SECONDS)
        .build()

    override val credentialStore: CredentialStore = DefaultCredentialStore(context)
    override val sessionGateway: SessionGateway = DefaultSessionGateway(
        credentialStore = credentialStore,
        credentialHolder = credentialHolder,
    )

    /** Pairing runs before a credential exists, so it keeps its own unauthenticated client. */
    override val pairingApi: PairingApi = DefaultPairingApi()
    override val pairingPayloadParser: PairingPayloadParser = DefaultPairingPayloadParser(
        rejectCleartext = !BuildConfig.DEBUG,
    )
    override val pairingCoordinator: PairingCoordinator = DefaultPairingCoordinator(
        pairingApi = pairingApi,
        credentialStore = credentialStore,
        sessionGateway = sessionGateway,
    )
    override val deviceNameProvider: () -> String = ::defaultDeviceName

    override val agentApi: AgentApi = DefaultAgentApi(client = authenticatedClient)
    override val eventStreamFactory: EventStreamFactory = EventStreamFactory { serverOrigin ->
        OkHttpEventStream(client = authenticatedClient, serverOrigin = serverOrigin)
    }
    override val sessionStreamFactory: SessionStreamFactory = OkHttpSessionStreamFactory(
        client = authenticatedClient,
    )
    override val connectionGateway: ConnectionGateway = DefaultConnectionGateway(
        streamFactory = eventStreamFactory,
        scope = applicationScope,
    )
    override val navigationPreferences: NavigationPreferences = DefaultNavigationPreferences(context)
    override val operatorRepository: OperatorRepository = DefaultOperatorRepository(agentApi)

    override val activeSessionTracker: ActiveSessionTracker = DefaultActiveSessionTracker()
    override val sessionStreamBroker: SessionStreamBroker = DefaultSessionStreamBroker(
        streamFactory = eventStreamFactory,
        scope = applicationScope,
    )
    override val openSessionRequests: OpenSessionRequests = DefaultOpenSessionRequests()
    override val sessionForegroundCoordinator: SessionForegroundCoordinator =
        SessionForegroundCoordinator(
            tracker = activeSessionTracker,
            permissionChecker = AndroidNotificationPermissionChecker(context),
            launcher = AndroidSessionForegroundLauncher(context),
            streamBroker = sessionStreamBroker,
        )
}
