# Manager Pilot Readiness Checklist

Use this checklist before, during, and after a pilot field day.

This checklist is for pre-flight readiness, supervision, and sign-off. For structured scenario execution, use `docs/operations/field_test_plan.md`.
For deployment-window cutover and launch sign-off, use `docs/operations/go_live_checklist.md`.

## Before the Pilot Day

- Confirm the internet-hosted server is reachable.
- Confirm the web app loads over HTTPS on both phones and the tablet.
- Confirm collector and shop staff accounts exist and can log in.
- Confirm each field device has a fixed role:
  - collector phone
  - shop phone
  - tablet
- Confirm both phones have working mobile data or at least intermittent signal in the expected area.
- Confirm all devices are fully charged.
- Confirm power banks, charging cables, and adapters are packed.
- Confirm the tablet has the latest product images and prices cached.
- Confirm the shop phone has the latest item prices and inventory state synced.
- Confirm the collector phone has the latest people and configuration data synced.
- Confirm staff know the rule that newly earned same-day points are not spendable until both phones sync successfully.

## Device Provisioning

- Assign a clear device name to each device:
  - `collector-phone-1`
  - `shop-phone-1`
  - `catalog-tablet-1`
- Record the phone number or SIM identifier for each phone.
- Record which staff member is responsible for each device.
- Confirm browser storage has not been cleared since the previous successful sync.
- Confirm the app is opened once on each device before leaving so cached assets are loaded.

## Before Opening on Site

- Ask both staff members to log in on their assigned phones.
- Run `Sync Now` on the collector phone if signal is available.
- Run `Sync Now` on the shop phone if signal is available.
- Check that the tablet still opens the catalog and shows images offline.
- Confirm staff understand which transactions belong on which phone.
- Confirm staff know what to do if sync fails:
  - continue working offline
  - do not reinstall the app
  - do not clear browser data

## During Trading Oversight

- Monitor battery levels on both phones.
- If signal appears, ask staff to sync collector first and shop second.
- Only treat newly earned points as available after both phones have synced successfully.
- Use the tablet only as a display device.
- Record scenario results in `docs/operations/field_test_execution_sheet.md`.

## Closing Procedure

- Stop new transactions before pack-up.
- Move to a place with signal if needed.
- Run end-of-day sync on the collector phone.
- Run end-of-day sync on the shop phone.
- Repeat sync once if needed so both devices pull each other's newly accepted events.
- Confirm pending events are cleared if the app exposes that status.
- Refresh the tablet catalog only after phone sync is complete.

## Incident Handling

- If a phone cannot sync, keep it powered on.
- Do not clear browser data.
- Do not hand the device to another user for unrelated browsing.
- Record:
  - device name
  - staff user
  - last successful sync time shown by the app
  - whether transactions continued after the sync failure
- Escalate the issue after the team reaches stable connectivity.

## After the Pilot Day

- Review the completed `docs/operations/field_test_execution_sheet.md`.
- Convert failures, blocked scenarios, and notable issues into `docs/operations/field_test_findings_log.md`.
- Decide whether the current two-phone plus tablet model is adequate or needs changes.

## Sign-Off

- Server reachable before departure
- Collector phone prepared
- Shop phone prepared
- Tablet prepared
- Staff briefed on same-day points rule
- End-of-day sync completed or issue logged
