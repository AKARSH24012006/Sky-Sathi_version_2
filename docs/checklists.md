# SkySathi — Roadmaps & Checklists

## Development roadmap (12 weeks to store submission)
Weeks 1–2: RN shell, navigation, theme, port Home/Flight/Calm from the prototype spec; guest auth live.
Weeks 3–4: sensor engine on-device (barometer+IMU), detector wired, Sensor Lab; record first 3 real flights.
Weeks 5–6: chat via API (RAG+memory), offline KB parity, Hindi pass; wallet + airport mode ported.
Weeks 7–8: journal/achievements sync, family share page, local boarding notifications, premium purchase flow (UPI + stores).
Weeks 9–10: a11y modes, performance/battery pass on 3 real devices, Sentry+PostHog, closed beta (50 users).
Weeks 11–12: beta fixes, store assets, privacy labels, review submissions.

## Launch checklist
- [ ] Golden-vector suites green in both languages (CI)
- [ ] 10 recorded real flights replayed as regression fixtures
- [ ] Panic path (any screen → Calm) under 1 tap, tested with VoiceOver/TalkBack
- [ ] Offline mode: full flight narration with radios off, verified in-flight
- [ ] Claude outage drill: offline KB serves every suggested question acceptably
- [ ] Privacy: export & erase verified end-to-end (device + server rows gone)
- [ ] App Store privacy nutrition labels + Play Data Safety accurate to schema
- [ ] Crash-free sessions >99.5% across final beta week
- [ ] Battery <2%/hour in flight mode on Pixel 6a + iPhone 12 (floor devices)
- [ ] Rate limits verified under load (k6, 100 rps on /conversations/chat)

## Production checklist
- [ ] Secrets only in Secret Manager; repo scanned (gitleaks) clean
- [ ] DB: automated backups + tested restore; expand-migrate-contract policy documented
- [ ] Rollback drill executed: api revision + staged store rollout halt
- [ ] Alerts: p95 chat latency, 5xx rate, revoked-jti reuse, crash spike
- [ ] Data retention jobs live: sensor_events 90d, soft-deleted users purged 30d
- [ ] Audit log review cadence assigned; incident response doc written
- [ ] Legal: privacy policy + terms live; DPDP consent records stored per purpose

## Investor demo checklist
- [ ] Two phones: one runs the app, one runs the family share view live
- [ ] Demo flight with detector chip visible — "it infers, it doesn't script"
- [ ] Airplane-mode toggle mid-demo: chat still answers (offline moat, on stage)
- [ ] Sensor Lab: shake the phone, watch motion energy + explain the FSM
- [ ] Journal with 3 flights showing calm trend up — the outcome metric
- [ ] One slide: turbulence network flywheel (every user makes forecasts better)
- [ ] One slide: unit economics (₹149/flight, CAC via fear-of-flying communities)
- [ ] The Stage 1–4 HTML prototypes open in tabs — velocity as the pitch

## Future technical roadmap (post-launch)
Q1: ML phase classifier shadowing the FSM; turbulence network seeded with public EDR; streaming chat replies.
Q2: smartwatch heart-rate signal (opt-in), boarding-pass scanning, Live Activities/widgets.
Q3: cabin-announcement understanding (on-device STT), airline white-label pilot, multilingual expansion (ta, te, bn).
Q4: personalized explanation ranking (bandit), international routes + visa content, SOC 2 groundwork for enterprise.
