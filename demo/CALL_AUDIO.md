# Call audio handoff

The backend follows the call-wall update at `9db1ddb`.
The call-wall rendering is unchanged.

## Start a run

`POST /api/pool/negotiate-all` with `{ "mode": "live", "round2": false }` starts every configured lane concurrently using `Promise.allSettled`.
Two configured lanes start two conversations, and five configured lanes start five.
Set `DIAL_PARALLEL_LANES` to an array of `{ vendorId, callerNumberId, vendorNumberId, vendorPhone }` objects.
Each lane needs its own caller number and vendor number, distinct across both roles.
The current account has two phone numbers, so two simultaneous Dial-to-Dial conversations require two additional numbers.
The current account's `limits` value is null, so Dial's free-account concurrency restriction does not apply to this account.
No additional phone numbers were purchased and no new live calls were placed during verification.

Pass `parallel:false` for the previous sequential live mode.
Replay runs remain sequential and keep the existing quote-extraction behavior.
Sequence numbers remain unique, including retries.
A concurrent round cites only completed earlier offers available before that round starts.

## Audio contract

Every returned Call includes these additive fields, including old stored calls:

```ts
vendorDialCallId: string | null;
audio: {
  liveUrl: string | null;
  liveKind: "websocket" | "hls" | "mp3" | "webrtc" | null;
  recordingUrl: string | null;
  expiresAt: string | null;
};
```

`audio.liveUrl` and `audio.liveKind` are null.
No managed live listen-in endpoint was found in Dial's published API, and the tested listen and monitor paths returned 404.
Dial's documented self-hosted audio WebSocket is for running the voice pipeline, rather than joining an existing managed call.
The account event stream carries status events rather than playable audio.

When Dial reports a finished call with `recordingAvailable:true`, refresh sets `audio.recordingUrl` to `/api/calls/<app-call-id>/audio` with a signed, 24-hour query string.
The browser can play this URL in an `<audio>` element without a WebSocket player.
The verified provider recording is a mono WAV file, 24 kHz, 16-bit.
The buyer call record has both agent and other-party transcript turns.
The inbound vendor leg is a separate Dial call, and refresh stores its id only when caller, callee, and connection time identify one unambiguous match.
The proxy always requests the buyer leg's recording.

The proxy forwards a single Range header and preserves 206, Content-Range, and Content-Length responses.
The browser never receives the Dial API key or the signed upstream storage URL.
The signature binds the application call id, buyer Dial call id, and expiration.
The proxy can work on another Vercel instance without the original SQLite row.
`audio.expiresAt` is 24 hours after the link was generated.
Finished live recordings are also saved locally under `public/recordings/<vendorId>.wav`, or the detected M4A or MP3 format.
Vercel cannot write its deployed public directory, so hosted fresh recordings use the proxy and local files must be committed and redeployed to become bundled replay assets.

## Five saved calls

`GET /api/recordings` returns `{ calls: Call[], quotes: Quote[] }` for all five bundled real recordings.
It works independently of SQLite state and does not start phone calls or extraction requests.
Each call has `source:"recorded_replay"`, its original timestamp and transcript, and an `audio.recordingUrl` under `/recordings/<vendorId>.m4a`.
Use this endpoint for saved playback even when `/api/pool` has no call rows.
These M4A files also play in an `<audio>` element.
The front end should use the selected Call's recording URL, rather than deriving a vendor filename for a new live call.

## Provider endpoints and verification

The implementation uses `POST /api/v1/calls`, `PATCH /api/v1/numbers/:id`, `GET /api/v1/calls/:id`, and `GET /api/v1/calls?direction=inbound`.
The recording endpoint is `GET /api/v1/calls/:id/recording` with a server-side bearer header.
The recording endpoint returned a 302 to signed storage at `t3.storageapi.dev`, followed by a 206 WAV response.
The server follows that redirect without sending the bearer key to storage.
The current public API reference does not list the recording endpoint, so its support is verified by an actual API request rather than documentation alone.

Calls still request `maxCallDurationSeconds:180`.
[Dial's limits documentation](https://docs.getdial.ai/documentation/reference/usage-and-limits) says unpaid accounts allow two simultaneous inbound and outbound legs combined and cap calls at 300 seconds.
[Dial's self-hosted documentation](https://docs.getdial.ai/documentation/platform/self-hosted) describes the separate voice-pipeline WebSocket mode.

Existing regression checks cover five concurrent starts within two seconds using mocked Dial responses, recording metadata, proxy ranges and authentication, and the unchanged pool response.
Real metadata and recording downloads were checked with the existing API key.
Actual concurrent calls remain unverified until the additional phone numbers and lane configuration are supplied.
The hosted app still uses temporary SQLite storage, as durable storage was deferred.


## Saved quote recovery

The library also includes five supplier-stated quotes extracted from the bundled real transcripts.
Each quote matches its recording id and includes transcript evidence, fees, volume conditions, and the original expiry.
The call wall shows the stated seat price and keeps account fees in the existing call summary.
Certly quoted $22 per seat for the 96-seat cohort.
Vantly quoted $21 per seat with a $50 account fee and a minimum of 10 seats per company.
Trustwise quoted $24 per seat at 50 or more seats, with no account fee and first-year pricing only.
Auditly quoted $16 per seat for the 86-seat cohort, plus $150 per account.
ComplyKit's final quote was $21 per seat for the 86-seat cohort with no account fee and a 12-month commitment.
Recorded display quotes do not write to the current pool database or enable settlement without current call rows.

## Winner eligibility

The seeded pool has 96 seats, but 10 are reserved for Certly and 8 others have caps below ComplyKit's $21 price.
ComplyKit therefore has 78 qualifying seats against its 86-seat cohort requirement.
Trustwise has 56 qualifying seats against its 50-seat threshold, so its $24 offer currently ranks first.
Eight additional eligible seats allow ComplyKit's $21 offer to win.
Vantly's 10-seat requirement is per company, represented by the optional `Quote.minSeatsPerAccount` field and enforced before those seats support a vendor's volume tier.
Quotes without this field retain their existing behavior.
