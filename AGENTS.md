# Noise Monitor

- This repository is an independent local-LAN service, not part of Family Hub.
- Keep raw audio ephemeral; never store recordings or transcriptions.
- The local SQLite database is the source of truth and is not committed.
- Treat calibrated SPL values as estimates, not regulatory measurements.
- Keep the service functional when no microphone input is available.
