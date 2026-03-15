# Field Staff Checklist

Use this checklist on swap-shop days at low-connectivity sites.

This document is the short day-of-trading procedure for staff. It is not the structured test script. For pilot scenario execution, use `docs/operations/field_test_plan.md`.

## Device Roles

- Collector phone:
  - register people
  - record intake
- Shop phone:
  - check balances shown on the phone
  - record sales
- Tablet:
  - show item pictures and prices only
  - do not use it to record transactions

## Before Leaving

- Charge both phones and the tablet.
- Carry power banks and charging cables.
- Open the app on both phones and confirm staff can log in.
- On the collector phone, run `Sync Now`.
- On the shop phone, run `Sync Now`.
- On the tablet, refresh the catalog so images and prices are available offline.
- Confirm the shop phone shows the latest items and prices before departure.

## Before Opening the Shop

- Check whether signal is available.
- If signal is available, run `Sync Now` again on both phones.
- Confirm the tablet still shows product images correctly.
- Confirm staff know which phone is used for which job.

## During Trading

- Use the collector phone for all intake work.
- Use the shop phone for all sales.
- Keep the tablet as display-only.
- If signal briefly appears, staff may run `Sync Now`, but do not stop trading if sync fails.
- Follow the manager's test sequence for any pilot scenarios being run that day.

## Important Rule for Points

- A customer may spend points only if those points are visible on the shop phone.
- If the customer earned points earlier the same day on the collector phone, those points are not available for spending until both phones sync successfully with the server.
- If there is doubt, do not complete the sale until sync succeeds.

## If Connectivity Appears During the Day

- First sync the collector phone.
- Then sync the shop phone.
- If needed, sync the shop phone a second time so it pulls the collector phone's newly uploaded events.
- Only after that should staff rely on newly earned points being available for spending.

## Before Closing

- Stop taking new transactions.
- Check whether both phones still have battery.
- Move to a place with signal if the current location has none.

## End of Day

- On the collector phone, run `Sync Now`.
- On the shop phone, run `Sync Now`.
- Repeat sync once on both phones if needed.
- Confirm pending events are cleared if the app shows that status.
- Refresh the tablet catalog only after phone sync is complete.

## If Something Goes Wrong

- If a phone cannot sync, keep the device powered on and do not clear browser data.
- Do not reinstall the app during the field day.
- Record which device has the unsynced data.
- Ask a manager to log the issue in the field test findings log when connectivity is available.

## Supervisor Sign-Off

- Collector phone synced
- Shop phone synced
- Tablet refreshed if needed
- Devices charging for the next field day
- Any sync failures or unusual incidents written down
