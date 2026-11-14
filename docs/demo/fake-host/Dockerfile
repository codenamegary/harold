FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends --no-upgrade \
        bash \
        ca-certificates \
        curl \
        git \
        less \
        openssh-client \
        openssh-server \
        python3 \
    && rm -rf /var/lib/apt/lists/*

# The demo user. Password auth is disabled in sshd_config, and '*' is not a
# usable password hash, so this account can only ever authenticate by key.
RUN useradd --create-home --shell /bin/bash gary \
    && usermod -p '*' gary

# Fixed host key so the fingerprint in the video and the app never changes.
COPY fake-host/keys/ssh_host_ed25519_key /etc/ssh/ssh_host_ed25519_key
COPY fake-host/keys/ssh_host_ed25519_key.pub /etc/ssh/ssh_host_ed25519_key.pub
RUN chmod 600 /etc/ssh/ssh_host_ed25519_key \
    && chmod 644 /etc/ssh/ssh_host_ed25519_key.pub

COPY fake-host/sshd_config /etc/ssh/sshd_config
COPY fake-host/agent/fake_agent.py /opt/harold-demo/agent/fake_agent.py
COPY fake-host/tools/gh /opt/harold-demo/tools/gh
COPY fake-host/entrypoint.sh /usr/local/bin/harold-demo-entrypoint
COPY fake-host/bin/authorized-keys /usr/local/bin/harold-demo-authorized-keys
COPY fake-host/seed/workspaces.json /opt/harold-demo/seed/workspaces.json
COPY fake-host/seed/agents.json /opt/harold-demo/seed/agents.json
COPY capture/fixtures/cat-screensaver /opt/harold-demo/fixture/cat-screensaver

RUN chmod 755 /opt/harold-demo/tools/gh /usr/local/bin/harold-demo-entrypoint \
    /usr/local/bin/harold-demo-authorized-keys \
    && ln -sf harold-demo-authorized-keys /usr/local/bin/add-authorized-key \
    && ln -sf harold-demo-authorized-keys /usr/local/bin/reset-authorized-keys

# Fail the build if the keys-only sshd config is rejected.
RUN mkdir -p /run/sshd && /usr/sbin/sshd -t -f /etc/ssh/sshd_config

EXPOSE 2222

ENTRYPOINT ["/usr/local/bin/harold-demo-entrypoint"]
