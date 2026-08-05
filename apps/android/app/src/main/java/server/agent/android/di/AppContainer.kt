package server.agent.android.di

import android.content.Context
import server.agent.android.BuildConfig
import server.agent.android.credentials.CredentialStore
import server.agent.android.credentials.DefaultCredentialStore
import server.agent.android.network.DefaultPairingApi
import server.agent.android.network.PairingApi
import server.agent.android.pairing.DefaultPairingCoordinator
import server.agent.android.pairing.DefaultPairingPayloadParser
import server.agent.android.pairing.PairingCoordinator
import server.agent.android.pairing.PairingPayloadParser
import server.agent.android.pairing.defaultDeviceName
import server.agent.android.session.DefaultSessionGateway
import server.agent.android.session.SessionGateway

interface AppContainer {
    val sessionGateway: SessionGateway
    val credentialStore: CredentialStore
    val pairingApi: PairingApi
    val pairingPayloadParser: PairingPayloadParser
    val pairingCoordinator: PairingCoordinator
    val deviceNameProvider: () -> String
}

class DefaultAppContainer(
    context: Context,
) : AppContainer {
    override val credentialStore: CredentialStore = DefaultCredentialStore(context)
    override val sessionGateway: SessionGateway = DefaultSessionGateway(credentialStore)
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
}
