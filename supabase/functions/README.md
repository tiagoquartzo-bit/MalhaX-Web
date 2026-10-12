# Supabase Edge Functions

Functions exposed to the client must validate the bearer token, check organization-scoped roles, validate input, and keep service-role secrets exclusively in the function environment.

## `driver-route`

Calculates a road route from the signed-in driver's current GPS position to the active stop. It verifies that the authenticated driver owns the trip and that the destination is one of its stops before sending coordinates to OpenRouteService. The provider key stays in the Edge Function environment and is never bundled into the Android app. Route geometry and turn instructions are returned for display in the in-app MapLibre map.

Required function secret: `OPENROUTESERVICE_API_KEY`.

- Local: store the key in an ignored env file and run `supabase functions serve driver-route --env-file supabase/.env.local`.
- Hosted Supabase: set the secret with `supabase secrets set OPENROUTESERVICE_API_KEY=...` and deploy with `supabase functions deploy driver-route`.

Create a Standard API key in the OpenRouteService account first. The free Standard plan is rate-limited; routing needs internet access and valid coordinates on the active stop. The app shows an error rather than drawing invented turn guidance if the provider is not configured or unavailable.

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
