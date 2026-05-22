# Security Specifications TDD (Adversarial Audit)

## 1. Data Invariants
- **Owner Lock**: A meeting log MUST have a `userId` matching the creator's direct `request.auth.uid`.
- **Verified Access**: All standard writes and reads require an authenticated session where `request.auth.uid != null` and `request.auth.token.email_verified == true`.
- **Status Progression**: A meeting in terminal state ('completed' or 'failed') cannot be updated to 'processing' (no status shortcuts or regressions).
- **ID Poisoning Rule**: All document IDs must be valid alphanumeric sequences `<= 128` characters.

---

## 2. The "Dirty Dozen" Malicious Payloads

### P1: Identity Spoofing (Owner field hijack)
Attacker tries to set the owner `userId` to a victim's UID.
```json
{
  "id": "meet_malicious_01",
  "userId": "victim_uid_123",
  "title": "Malicious Meeting Hijack",
  "date": "2026-05-22",
  "duration": 120,
  "platform": "recording",
  "template": "scrum",
  "status": "processing"
}
```
*Expected: PERMISSION_DENIED*

### P2: State Fast-forward (Status hijacking)
Attacker creates a pre-completed meeting to inject arbitrary AI reports without transcription processing.
```json
{
  "id": "meet_malicious_02",
  "userId": "attacker_uid_999",
  "title": "Fake Success",
  "date": "2026-05-22",
  "duration": 5,
  "platform": "recording",
  "template": "scrum",
  "status": "completed"
}
```
*Expected: PERMISSION_DENIED (Must start as "processing")*

### P3: Missing Core Invariant (No Owner field)
Attacker attempts a shadow record with no explicit `userId` tag.
```json
{
  "id": "meet_malicious_03",
  "title": "No User ID Here",
  "date": "2026-05-22",
  "duration": 50,
  "platform": "google-meet",
  "template": "client",
  "status": "processing"
}
```
*Expected: PERMISSION_DENIED*

### P4: Unauthenticated Creator
Unauthenticated attacker tries to inject meetings.
*Expected: PERMISSION_DENIED*

### P5: Target ID Poisoning (Resource exhaustion)
Attacker tries to write to a massive corrupted path or custom string segment containing code-injection markers.
```
Path: /meetings/../../SYSTEM_CORRUPTION_INJECTION_SCRIPT
```
*Expected: PERMISSION_DENIED*

### P6: Unverified Email Hijack
Attacker creates accounts using temp emails without verifying them, trying to bypass the email_verified check.
*Expected: PERMISSION_DENIED*

### P7: Value Poisoning (Injecting a 5MB String into fields)
Attacker injects massive telemetry noise payload to exhaust DB quotas.
```json
{
  "title": "A".repeat(50000)
}
```
*Expected: PERMISSION_DENIED*

### P8: Client-Side Update-Gap (Ghost field injection)
Attacker tries to add a custom privilege status `role: "admin"` directly to the meeting log or user profile.
```json
{
  "id": "meet_091",
  "userId": "attacker_uid",
  "role": "admin"
}
```
*Expected: PERMISSION_DENIED (AffectedKeys violation)*

### P9: Cross-User Read Probe (List scraping)
Attacker logged in as `attacker_uid` performs a broad query lacking the exact `where("userId", "==", "attacker_uid")` cursor, attempting to read a victim's document.
*Expected: PERMISSION_DENIED*

### P10: Terminal State Editing Override
After the server completes processing, an attacker attempts to overwrite the approved AI decisions or follow-ups.
```json
{
  "title": "Altered Decisions post-discussion"
}
```
*Expected: PERMISSION_DENIED (No updates on completed status documents)*

### P11: Empty Platform Injection String
```json
{
  "id": "meet_bad",
  "platform": ""
}
```
*Expected: PERMISSION_DENIED*

### P12: Cross-User Record Mutation
Attacker logged in as `user_A` tries to perform a deletion or field alteration on a document owned by `user_B`.
*Expected: PERMISSION_DENIED*

---

## 3. The Security Verification Suit
All validation tests require strict validation of security assertions.
The `firestore.rules` will enforce these twelve tests synchronously at runtime.
