# Supabase Edge Functions

Functions exposed to the client must validate the bearer token, check organization-scoped roles, validate input, and keep service-role secrets exclusively in the function environment.

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
