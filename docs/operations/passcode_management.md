# Passcode Management

There is no self-service passcode change in the application. All passcode changes must be performed by an administrator.

## Obtain a Bearer Token

All API calls require a bearer token. Obtain one by logging in:

```bash
curl -X POST https://<domain>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "passcode": "1234"}'
```

The response contains the token:

```json
{
  "user": { "id": "...", "username": "admin", "role": "administrator" },
  "token": "<bearer-token>"
}
```

Use the `token` value as the `Authorization: Bearer <token>` header in subsequent requests.

## Change a User's Passcode (Administrator)

An administrator can update any user's passcode via the API:

```bash
curl -X PATCH https://<domain>/api/users/<userId> \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"passcode": "newpasscode"}'
```

The `userId` is the UUID of the staff user. A successful response returns the updated user object with status 200.

To obtain the user ID, list all users first:

```bash
curl https://<domain>/api/users \
  -H "Authorization: Bearer <admin-token>"
```

## Reset Passcode via Seed Script (CLI)

Use this when an administrator's own passcode is lost or when setting up known passcodes before a deployment:

```bash
# Single user reset
$env:STAFF_SEED_JSON='[{"username":"admin","passcode":"9876","role":"administrator"}]'
npm run seed:staff

# Multiple users at once
$env:STAFF_SEED_JSON='[{"username":"admin","passcode":"9876","role":"administrator"},{"username":"collector1","passcode":"5678","role":"user"}]'
npm run seed:staff
```

The seed script performs an upsert — it updates the existing user record without deleting history or re-creating the account.

Run this from `/opt/recycling-swap-shop` as the `recycling` user:

```bash
sudo su - recycling -s /bin/bash
cd /opt/recycling-swap-shop
# set STAFF_SEED_JSON and run seed:staff as above
exit
```

## Permissions

Only users with the `administrator` role have the `users.manage` permission required to call `PATCH /users/:userId`. A `user`-role account cannot change passcodes, including their own.
