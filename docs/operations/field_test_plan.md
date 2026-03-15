# Field Test Plan

Use this plan to run a pilot field day and record whether the current two-phone plus tablet operating model works in real conditions.

This document is for structured scenario execution. For pre-flight and sign-off, use `docs/operations/manager_pilot_readiness_checklist.md`. For short staff instructions during trading, use `docs/operations/field_staff_checklist.md`.

## Test Setup

- Devices:
  - `collector-phone-1`
  - `shop-phone-1`
  - `catalog-tablet-1`
- Roles:
  - collector on collector phone
  - shop operator on shop phone
  - tablet used as read-only catalog only
- Baseline assumptions:
  - server reachable before departure
  - both phones have completed a pre-day sync when signal is available
  - tablet catalog has been refreshed before departure
  - same-day points are only spendable after collector sync followed by shop sync

## Evidence Rules

For every scenario, record:

- date and site
- scenario ID
- tester name
- device used
- result: `Pass`, `Fail`, or `Blocked`
- observed evidence
- follow-up notes

Use `docs/operations/field_test_execution_sheet.md` during the pilot and `docs/operations/field_test_findings_log.md` after the pilot.

## Scenario Matrix

| ID    | Scenario                                        | Setup / Preconditions                                                                | Device / Role                   | Steps                                                                                              | Expected Outcome                                                                               | Evidence to Record                                                        |
| ----- | ----------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| FT-01 | Morning startup and pre-sync readiness          | Server reachable; all devices charged                                                | Manager + all devices           | Confirm login, run pre-day sync on both phones, refresh tablet catalog                             | Both phones show successful sync state; tablet opens catalog offline                           | Sync timestamps, tablet catalog check, any startup issue                  |
| FT-02 | Person registration on collector phone          | Collector logged in                                                                  | Collector phone / collector     | Search for missing person, register new person, confirm person appears in registry                 | Person can be created without connectivity assumptions; masked ID/phone display remains intact | Created person name, whether save succeeded, any validation issue         |
| FT-03 | Intake while offline                            | Collector phone disconnected or treated as offline                                   | Collector phone / collector     | Record intake for a person with one or more material lines                                         | Intake can be completed offline and queues locally without blocking work                       | Pending-event indicator, intake confirmation, any error message           |
| FT-04 | Sale using already-synced points                | Shop phone has person balance from last successful sync                              | Shop phone / shop operator      | Open person, verify balance, complete sale using available points                                  | Sale succeeds and stock/balance update locally on the shop phone                               | Starting balance shown, sale total, post-sale balance shown               |
| FT-05 | Attempted same-day sale before both phones sync | Collector recorded new intake earlier the same day; shop phone has not yet pulled it | Shop phone / shop operator      | Try to sell against the newly earned same-day points                                               | Sale is blocked or deferred because those points are not yet visible on the shop phone         | Balance shown on shop phone, staff decision, customer-impact note         |
| FT-06 | Midday sync when connectivity briefly appears   | Both phones have queued work; signal becomes available                               | Collector phone then shop phone | Run `Sync Now` on collector phone, then shop phone, then retry if needed                           | Newly earned points become available only after the sync sequence completes successfully       | Sync order used, success/failure per phone, resulting balance visibility  |
| FT-07 | Collector-first then shop-second sync flow      | Same as FT-06                                                                        | Both phones                     | Repeat the documented sync order and verify staff follow it correctly                              | Staff can execute the sync order without confusion; no role crossover occurs                   | Whether staff followed order, any confusion, any retry needed             |
| FT-08 | End-of-day sync and pending-event clearing      | Trading stopped; signal available or team moved to signal                            | Collector phone then shop phone | Run closing sync flow, repeat if needed, confirm pending events clear when possible                | End-of-day sync completes or failure is logged with device ownership preserved                 | Pending counts, final sync timestamps, any unsynced device                |
| FT-09 | Tablet refresh after phone sync                 | End-of-day phone sync completed                                                      | Tablet                          | Refresh catalog only after phone sync is done                                                      | Tablet updates only after transactional devices finish syncing                                 | Whether refresh was done at the correct time, any stale price/image issue |
| FT-10 | No connectivity all day                         | Simulated or real lack of signal                                                     | All devices                     | Work through registration, intake, and sale flows without daytime sync                             | Core workflows remain usable offline; staff follow the same-day points rule                    | Which workflows succeeded, any blocked workflow, staff confidence notes   |
| FT-11 | One phone sync fails                            | One phone intentionally or actually cannot sync                                      | Affected phone + manager        | Attempt sync, keep device powered on, do not clear browser data, continue documented incident flow | Staff preserve queued data and record incident details without destructive recovery attempts   | Device name, last sync time, whether work continued, incident notes       |
| FT-12 | Stale inventory or prices on shop device        | Shop phone intentionally left without a fresh pre-day sync or stale data is observed | Shop phone / shop operator      | Compare expected stock/prices with visible values and follow escalation path                       | Issue is detected before or during trading and logged for follow-up                            | What was stale, when it was noticed, operational impact                   |
| FT-13 | Battery or power interruption                   | Low-battery or charging problem occurs                                               | Any field device                | Continue using documented charging/power-bank process and note operational effect                  | Team can keep the correct device in service or log the interruption clearly                    | Affected device, downtime, whether queued data was preserved              |
| FT-14 | Unexpected balance disagreement                 | Collector and shop staff report different expectations for a person balance          | Both phones + manager           | Compare what each phone shows and apply the same-day points rule instead of guessing               | Staff avoid unsafe sale decisions and log the disagreement for review                          | What each phone showed, whether sale proceeded, incident details          |
| FT-15 | Conflict or rejected event surfaced after sync  | End-of-day or midday sync surfaces conflict/rejection                                | Manager + affected phone        | Open the relevant sync/conflict diagnostics, record issue, follow manager escalation flow          | Issue is recorded with enough detail for later resolution; staff do not clear browser data     | Conflict/rejection message, affected event/workflow, next action          |

## Exit Criteria

The field test day is considered complete when:

- all mandatory scenarios that were feasible on the day are marked `Pass`, `Fail`, or `Blocked`
- every failed or blocked scenario has a written note
- any unsynced-device incident is recorded with device name and last successful sync
- same-day points behavior has been exercised at least once
- end-of-day sync outcome is recorded for both phones
