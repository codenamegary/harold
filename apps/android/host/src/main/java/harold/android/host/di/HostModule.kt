package harold.android.host.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import harold.android.host.DefaultHostApi
import harold.android.host.HostAgentApi
import harold.android.host.HostWorkspaceApi
import harold.android.host.SshAgentProcessLauncher
import harold.android.host.SshSessionFileService
import harold.android.network.AgentAuthApi
import harold.android.network.AgentSettingsApi
import harold.android.network.AttachmentApi
import harold.android.network.GitApi
import harold.android.network.HostApi
import harold.android.network.WorkspaceApi
import harold.android.process.AgentProcessLauncher
import harold.android.process.SessionFileService
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class HostModule {
    @Binds
    @Singleton
    abstract fun hostApi(impl: DefaultHostApi): HostApi

    @Binds
    @Singleton
    abstract fun workspaceApi(impl: HostWorkspaceApi): WorkspaceApi

    @Binds
    @Singleton
    abstract fun agentSettingsApi(impl: HostAgentApi): AgentSettingsApi

    @Binds
    @Singleton
    abstract fun agentAuthApi(impl: HostAgentApi): AgentAuthApi

    @Binds
    @Singleton
    abstract fun gitApi(impl: HostWorkspaceApi): GitApi

    @Binds
    @Singleton
    abstract fun attachmentApi(impl: HostWorkspaceApi): AttachmentApi

    @Binds
    @Singleton
    abstract fun agentProcessLauncher(impl: SshAgentProcessLauncher): AgentProcessLauncher

    @Binds
    @Singleton
    abstract fun sessionFileService(impl: SshSessionFileService): SessionFileService
}
