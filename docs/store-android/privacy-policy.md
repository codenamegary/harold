# Harold privacy policy

Effective date: TODO before publishing

Harold is an Android client for AI coding agents that run on hardware you control. This policy covers the Harold Android app.

## Who we are

Harold is published by codenamegary. Contact: gary@codenamegary.com.

## Data we collect

We do not collect personal data from the Harold app. The app has no account, no advertising SDK, and no analytics SDK.

## Data the app handles

The app stores the SSH hosts you add and the SSH credentials you enter for them. Credentials are encrypted with a key held by the Android Keystore.

When you use the app, these items travel between your phone and the hosts you connect to:

- Prompts and messages you send.
- Photos, files, and other attachments you choose.
- Session state, agent output, and tool results.
- SSH credentials needed to authenticate the session.

The developer does not receive this data. It goes to the hosts you connect to.

## Permissions

- **Microphone**: used only for voice dictation. Audio is processed on the device by the bundled English Vosk model. The transcript becomes part of your prompt and is sent to your host when you choose to send it.
- **Notifications**: used for session status and foreground service notices.

## Network connections

The app connects directly to your hosts over SSH. It does not use a developer-operated relay. SSH encrypts the traffic between your phone and the host. If you use a third-party tunnel, reverse proxy, or network provider, that provider may process traffic under its own policy.

## Sharing

We do not sell, rent, or share app data. We do not have access to your prompts, files, sessions, or agent output.

## Retention and deletion

App data stays on your phone until you clear the app data or uninstall the app. Host data stays on your machines. You can delete it there at any time.

## Children

Harold is a developer tool and is not directed at children under 13.

## Changes

We may update this policy when the app changes. The effective date at the top will change with the policy.

## Contact

Questions about this policy: gary@codenamegary.com
