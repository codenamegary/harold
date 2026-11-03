# Harold privacy policy

Effective date: TODO before publishing

Harold is an Android client for AI coding agents that run on hardware you control. This policy covers the Harold Android app.

## Who we are

Harold is published by codenamegary. Contact: gary@codenamegary.com.

## Data we collect

We do not collect personal data from the Harold app. The app has no Harold account, no advertising SDK, and no analytics SDK.

## Data the app handles

The app stores the Harold server addresses you pair with and the device credentials issued by those servers. Credentials are encrypted with a key held by the Android Keystore.

When you use the app, these items travel between your phone and the Harold server you configure:

- Prompts and messages you send.
- Photos, files, and other attachments you choose.
- Session state, agent output, and tool results.
- Device and pairing information needed to authenticate the session.

The developer does not receive this data. It goes to the server you run or choose.

## Permissions

- **Camera**: used only to scan pairing QR codes. The app does not take or store photos with the camera.
- **Microphone**: used only for voice dictation. Audio is processed on the device by the bundled English Vosk model. The transcript becomes part of your prompt and is sent to your server when you choose to send it.
- **Notifications**: used for session status and foreground service notices.

## Network connections

The app connects directly to the Harold server you pair with. It does not use a developer-operated relay. If you use a third-party tunnel, reverse proxy, or network provider, that provider may process traffic under its own policy.

Use HTTPS for any Harold endpoint outside a trusted local network. Plain HTTP is allowed for local networks and sends traffic in cleartext.

## Sharing

We do not sell, rent, or share app data. We do not have access to your prompts, files, sessions, or agent output.

## Retention and deletion

App data stays on your phone until you clear the app data or uninstall the app. Server data stays on the machine that runs Harold. You can remove a paired device with the Harold CLI and delete server data on that machine.

## Children

Harold is a developer tool and is not directed at children under 13.

## Changes

We may update this policy when the app changes. The effective date at the top will change with the policy.

## Contact

Questions about this policy: gary@codenamegary.com
