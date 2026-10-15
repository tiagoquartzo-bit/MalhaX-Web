# Supabase Edge Functions

Functions exposed to the client must validate the bearer token, check organization-scoped roles, validate input, and keep service-role secrets exclusively in the function environment.

## `geocode-order-stops`

Geocodes the address for each unpinned pickup or delivery before the order is saved. The function verifies the bearer token and an `admin`, `manager`, or `dispatcher` role, sends only address fields to HeiGIT's Pelias endpoint, and returns coordinates only for high-confidence, precise matches. A missing or ambiguous match blocks order creation until the address is corrected or its point is marked on the map. Contact details and delivery instructions are never sent to the provider, and request data is not logged.

Required function secret: `OPENROUTESERVICE_API_KEY`.

- Local: store the key in the ignored environment file and run `supabase functions serve geocode-order-stops --env-file supabase/.env.local`.
- Hosted Supabase: set the key with `supabase secrets set OPENROUTESERVICE_API_KEY=...` and deploy with `supabase functions deploy geocode-order-stops`.

The function uses `https://api.heigit.org/pelias/v1/search` with a Brazil country boundary. It processes stops sequentially to stay below the Standard geocoding per-minute limit.

## `invite-driver`

Invite-only driver provisioning for Activia. Requires a valid logged-in account with the `admin`, `manager`, or `support` role. The function invites the email using Supabase Auth, then calls the service-role-only `provision_invited_driver` RPC. It never accepts an organization or role from the request body.

Required function secrets:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MALHAX_APP_URL` (MalhaX web origin, such as `https://app.example.com`)

The project must have a production SMTP provider configured for delivery to arbitrary driver addresses. Allow the generated `/auth/confirm` URL in Supabase Auth redirect URLs.

Use this content for the Supabase Auth **Invite user** email template:

```html
<h2>Convite para o MalhaX</h2>
<p>Você foi cadastrado como motorista da Activia. Confirme seu e-mail para criar sua senha e concluir o acesso.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite">Confirmar e criar senha</a></p>
<p>Se você não esperava este convite, ignore esta mensagem.</p>
```

The confirmation route validates the one-time token, establishes the session, and sends the invited person to create a personal password.
