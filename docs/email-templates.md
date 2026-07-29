# Supabase email templates

Authentication → Emails. Each template is a different email; editing one does not
touch the others. Both of the two below must be the versions here.

The code is the primary path and the link is the fallback, in that order, because
a link tapped in a mail app opens in whatever browser that app prefers — often not
the one waiting for it. A typed code cannot go to the wrong browser.

`{{ .TokenHash }}` in the link, not `{{ .ConfirmationURL }}`: ConfirmationURL sends
people through Supabase's verifier, which hands the session back in a URL fragment
the server can never read. That is exactly the bug where somebody clicked a sign-in
link and landed on the signup form.

---

## Magic Link  — sent by "sign in with your email"

Subject: `Your SyncinLove code`

```html
<h2>Your sign-in code</h2>

<p style="font-size:32px;letter-spacing:0.12em;font-weight:700;margin:24px 0">{{ .Token }}</p>

<p>Type this into SyncinLove to sign in. It expires shortly and works once.</p>

<p style="color:#64748b;font-size:13px">
  Or <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">use this link instead</a>
  — the code is more reliable if you're reading this on a different device.
</p>

<p style="color:#64748b;font-size:13px">Didn't ask for this? Ignore it. Nothing happens.</p>
```

---

## Change Email Address — sent when securing a new account

Subject: `Confirm your email for SyncinLove`

```html
<h2>Confirm your email</h2>

<p style="font-size:32px;letter-spacing:0.12em;font-weight:700;margin:24px 0">{{ .Token }}</p>

<p>Type this into SyncinLove to attach this address to your account. Until you do,
losing your browser loses your streak.</p>

<p style="color:#64748b;font-size:13px">
  Or <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email_change">use this link instead</a>.
</p>
```

---

## Also check

- **URL Configuration → Site URL** must be `https://syncinlove.us`. `{{ .SiteURL }}`
  in the templates above resolves to it, so a wrong value here breaks both links.
- **Redirect URLs** should include `https://syncinlove.us/auth/callback` and
  `http://localhost:3000/auth/callback`.
