package harold.android.di

import android.content.Context
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient
import harold.android.BuildConfig
import harold.android.live.DefaultSessionOwner
import harold.android.live.SessionOwner
import harold.android.credentials.CredentialHolder
import harold.android.credentials.CredentialStore
import harold.android.credentials.DefaultCredentialStore
import harold.android.stream.OkHttpSessionStreamFactory
import harold.android.stream.SessionStreamFactory
import harold.android.foreground.ActiveSessionTracker
import harold.android.foreground.AndroidNotificationPermissionChecker
import harold.android.foreground.AndroidSessionForegroundLauncher
import harold.android.foreground.DefaultActiveSessionTracker
import harold.android.foreground.DefaultOpenSessionRequests
import harold.android.foreground.OpenSessionRequests
import harold.android.foreground.SessionForegroundCoordinator
import harold.android.navigation.DefaultNavigationPreferences
import harold.android.navigation.NavigationPreferences
import harold.android.network.AgentApi
import harold.android.network.BearerAuthInterceptor
import harold.android.network.DefaultAgentApi
import harold.android.network.DefaultPairingApi
import harold.android.network.PairingApi
import harold.android.operator.DefaultOperatorRepository
import harold.android.operator.OperatorRepository
import harold.android.pairing.DefaultPairingCoordinator
import harold.android.pairing.DefaultPairingPayloadParser
import harold.android.pairing.DefaultPairingRequests
import harold.android.pairing.PairingCoordinator
import harold.android.pairing.PairingPayloadParser
import harold.android.pairing.PairingRequests
import harold.android.pairing.defaultDeviceName
import harold.android.session.DefaultSessionGateway
import harold.android.session.SessionGateway

private const val WEB_SOCKET_PING_SECONDS = 20L

interface AppContainer {
    val sessionGateway: SessionGateway
    val credentialStore: CredentialStore
    val pairingApi: PairingApi
    val pairingPayloadParser: PairingPayloadParser
    val pairingCoordinator: PairingCoordinator
    val pairingRequests: PairingRequests
    val deviceNameProvider: () -> String
    val agentApi: AgentApi
    val sessionOwner: SessionOwner
    val navigationPreferences: NavigationPreferences
    val operatorRepository: OperatorRepository
    val activeSessionTracker: ActiveSessionTracker
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
    override val pairingRequests: PairingRequests = DefaultPairingRequests()
    override val deviceNameProvider: () -> String = ::defaultDeviceName

    override val agentApi: AgentApi = DefaultAgentApi(client = authenticatedClient)
    private val sessionStreamFactory: SessionStreamFactory = OkHttpSessionStreamFactory(
        client = authenticatedClient,
    )
    override val sessionOwner: SessionOwner = DefaultSessionOwner(
        streamFactory = sessionStreamFactory,
        scope = applicationScope,
    )
    override val navigationPreferences: NavigationPreferences = DefaultNavigationPreferences(context)
    override val operatorRepository: OperatorRepository = DefaultOperatorRepository(agentApi)

    override val activeSessionTracker: ActiveSessionTracker = DefaultActiveSessionTracker()
    override val openSessionRequests: OpenSessionRequests = DefaultOpenSessionRequests()
    override val sessionForegroundCoordinator: SessionForegroundCoordinator =
        SessionForegroundCoordinator(
            tracker = activeSessionTracker,
            permissionChecker = AndroidNotificationPermissionChecker(context),
            launcher = AndroidSessionForegroundLauncher(context),
        )
}
