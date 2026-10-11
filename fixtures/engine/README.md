# Engine fixtures

The executable campaigns are in `apps/server/tests/game/campaign.test.ts` (helpers in
`helpers.ts`) and use the real session API, engine and the deterministic fixture
dialogue provider. Run `npm run test`. They cover the three Spec 2.0 quests: Q1 buy a
drink (substitution, cancellation, price confirmation, payment), Q2 directions to
上海大酒店 (verified route, arrival), Q3 a photo at 黄浦江 (passerby request, capture),
plus request deduplication, concurrent retry and ephemeral audio registries.

`confirm-drink-price.json` is the shared evaluation example. Both slots are required
for the engine gate. Missing slots remain schema-valid so providers can ask for
clarification. Prices outside 0–1000 cannot enter the evaluation schema. The fixture
adapter recognizes the bounded pattern `茶|水` + numeral + `元` and the explicit
examples in `packages/shared/src/engine/fixture-dialogue.ts`; unknown utterances
produce clarification. It does not simulate general model understanding.

Validation sessions simulate XP/items/badges in their own server state, record no
independent evidence, and have no endpoint that converts them into player sessions.
Typed and edited transcripts never become spoken evidence.
